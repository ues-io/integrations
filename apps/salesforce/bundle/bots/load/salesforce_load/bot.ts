import {
	LoadBotApi,
	FieldRequest,
	ConditionRequest,
	LoadOrder,
	FieldValue,
} from "@uesio/bots"

type SoqlResponse = {
	done: boolean
	totalSize: number
	records: Record<string, object>[]
}

export default function salesforce_load(bot: LoadBotApi) {
	const {
		batchNumber = 0,
		batchSize = 100,
		collectionMetadata,
		conditions,
		fields,
		order,
	} = bot.loadRequest
	const { baseUrl } = bot.getCredentials()

	if (!baseUrl)
		throw new Error(
			`Missing baseUrl in salesforce credentials. Please ensure you have configured a value for the "salesforce_url" config value`
		)

	const soqlPath = "/services/data/v59.0/query/?q="

	// Build maps for quickly converting to/from Salesforce/Uesio field names
	const uesioFieldsBySalesforceName = {
		Id: "uesio/core.id",
		// Defaults - these can be overridden
		Name: "uesio/core.uniquekey",
		CreatedDate: "uesio/core.createdat",
		LastModifiedDate: "uesio/core.updatedat",
	} as Record<string, string>
	Object.entries(collectionMetadata.getAllFieldMetadata()).forEach(
		([uesioFieldName, fieldMetadata]) => {
			// Only expose fields that have a defined external field name
			// bot.log.info(
			// 	"uesioFieldName: " +
			// 		uesioFieldName +
			// 		", fieldMetadata external name: " +
			// 		fieldMetadata.externalName +
			// 		", name: " +
			// 		fieldMetadata.name
			// )
			if (fieldMetadata.externalName) {
				uesioFieldsBySalesforceName[fieldMetadata.externalName] =
					uesioFieldName
			}
		}
	)
	// Invert the map
	const salesforceFieldsByUesioName = Object.entries(
		uesioFieldsBySalesforceName
	).reduce((acc, entry) => {
		const [sfField, uesioField] = entry
		acc[uesioField] = sfField
		// bot.log.info("UESIO FIELD: " + uesioField + ", SF FIELD: " + sfField)
		return acc
	}, {} as Record<string, string>)

	const createUesioItemFromSalesforceRecord = (
		record: Record<string, FieldValue>
	) =>
		Object.entries(record).reduce(
			(acc: Record<string, FieldValue>, [sfField, value]) => {
				// Ignore special fields
				if (sfField === "attributes") return acc
				const uesioName = uesioFieldsBySalesforceName[sfField]
				if (!uesioName) return acc
				if (value !== null && value !== undefined) {
					const fieldMetadata =
						collectionMetadata.getFieldMetadata(uesioName)
					if (fieldMetadata && fieldMetadata.type === "TIMESTAMP") {
						// bot.log.info("sf TIMESTAMP value: " + value)
						const dateValue = Date.parse(value as string)
						if (dateValue) {
							value = dateValue / 1000
						} else {
							value = null
						}
						// bot.log.info("UESIO TIMESTAMP value: " + value)
					}
				}
				acc[uesioName] = value
				// bot.log.info(
				// 	"sfField: " +
				// 		sfField +
				// 		", uesioField[" +
				// 		fieldMetadata?.type +
				// 		"]: " +
				// 		uesioName +
				// 		", value: " +
				// 		value
				// )
				return acc
			},
			{}
		)

	const getSFOperator = (uesioOperator: string) => {
		switch (uesioOperator) {
			case "GT":
				return ">"
			case "LT":
				return "<"
			case "GTE":
				return ">="
			case "LTE":
				return "<="
			case "NOT_EQ":
				return "!="
			case "EQ":
				return "="
			case "IN":
				return "IN"
			default:
				return "="
		}
	}

	const parseFieldRequests = (
		fields: FieldRequest[],
		fieldsSet = new Set()
	) => {
		if (fields && fields.length) {
			fields.forEach((f) => {
				const sfFieldName = salesforceFieldsByUesioName[f.id]
				// bot.log.info("uesio field id: " + f.id + ", sf field: " + sfFieldName)
				fieldsSet.add(sfFieldName)
				if (f.fields && f.fields.length) {
					parseFieldRequests(f.fields, fieldsSet)
				}
			})
			return Array.from(fieldsSet.keys()).filter((f) => !!f)
		} else {
			return ["Id", "Name"]
		}
	}
	const escapeSingleQuotes = (value: string) => value.replace(/'/g, "\\'")
	const unquotedFieldTypes = ["NUMBER", "CHECKBOX"]
	const multiValueOperators = ["IN", "NOT_IN"]
	const nullish = (value: FieldValue) => value === null || value === undefined
	const parseCondition = (c: ConditionRequest) => {
		const {
			conditions = [] as ConditionRequest[],
			conjunction = "OR",
			subcollection,
			subfield,
			field,
			fields,
			value,
			values,
			type,
			operator,
		} = c
		const sfFieldName = salesforceFieldsByUesioName[field]
		const metadata = field
			? collectionMetadata.getFieldMetadata(field)
			: undefined
		const wrapValueInQuotes = metadata
			? !unquotedFieldTypes.includes(metadata.type)
			: true
		const sfOperator = getSFOperator(operator)
		const getValue = (v: FieldValue) =>
			wrapValueInQuotes && !nullish(v)
				? `'${escapeSingleQuotes(v as string)}'`
				: v
		if (type === "SEARCH") {
			// Implement a simple search by doing a LIKE on all fields provided
			return (fields || [])
				.map(
					(f) =>
						`${
							salesforceFieldsByUesioName[f]
						} LIKE '%${escapeSingleQuotes(value as string)}%'`
				)
				.join(" OR ")
		} else if (type === "GROUP") {
			return parseConditions(conditions, conjunction)
		} else if (type === "SUBQUERY") {
			return `${sfFieldName} IN (SELECT ${subfield} FROM ${subcollection} WHERE ${parseConditions(
				conditions,
				conjunction
			)}`
		} else if (multiValueOperators.includes(operator)) {
			return `${sfFieldName} ${sfOperator} (${values
				?.map(getValue)
				.join(",")})`
		} else {
			return `(${sfFieldName} ${sfOperator} ${getValue(
				value as FieldValue
			)})`
		}
	}
	const parseConditions = (
		conditions: ConditionRequest[],
		conjunction = "AND"
	): string =>
		`(${conditions.map(parseCondition).join(`) ${conjunction} (`)})`
	const parseOrders = (orders: LoadOrder[]) =>
		orders
			.map(
				(order) =>
					`${salesforceFieldsByUesioName[order.field]} ${
						order.desc ? "DESC" : "ASC"
					}`
			)
			.join(", ")
	const clauses = ["SELECT"]
	if (fields && fields.length) {
		clauses.push(parseFieldRequests(fields).join(", "))
	} else {
		clauses.push(["Id", "Name"].join(","))
	}
	clauses.push("FROM " + collectionMetadata.externalName)
	const activeConditions =
		conditions && conditions.length
			? conditions.filter((c) => !c.inactive)
			: []
	if (activeConditions.length) {
		clauses.push(`WHERE ${parseConditions(activeConditions)}`)
	}
	if (order && order.length) {
		clauses.push(`ORDER BY ${parseOrders(order)}`)
	}
	if (batchSize) {
		// Always fetch one more than asked for, so that we can determine if the server has more available
		clauses.push("LIMIT " + (batchSize + 1))
	}
	if (batchNumber > 0 && batchSize) {
		clauses.push("OFFSET " + batchSize * batchNumber)
	}
	const query = clauses.filter((c) => c.length > 0).join(" ")
	bot.log.info(
		"batch=" + batchNumber + ", size=" + batchSize + ", QUERY: " + query
	)
	const response = bot.http.request({
		method: "GET",
		url: baseUrl + soqlPath + encodeURIComponent(query),
	})
	bot.log.info(
		"Response from salesforce: " +
			response.code +
			", status=" +
			response.status
	)
	if (response.code !== 200) {
		let errMessage = ""
		let responseObj: Record<string, object>
		if (typeof response.body === "string") {
			try {
				responseObj = JSON.parse(response.body as string)
				if (responseObj.error) {
					errMessage = responseObj.error as unknown as string
				}
				// eslint-disable-next-line no-empty
			} catch (e) {}
		} else if (response.body && typeof response.body === "object") {
			if (response.body.error) {
				errMessage = response.body.error as string
			} else {
				bot.log.error(
					"unexpected error response from salesforce",
					response.body
				)
			}
		}
		if (errMessage) {
			bot.addError("error making salesforce request: " + errMessage)
			return
		}
		return
	}
	const soqlResponse = response.body as SoqlResponse
	soqlResponse.records.forEach((r, i) => {
		// If we are at the batch size, then we know that the serve has more records to return
		if (i === batchSize) {
			bot.setHasMoreRecords()
		} else {
			bot.addRecord(createUesioItemFromSalesforceRecord(r))
		}
	})
}

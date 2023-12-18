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
		collection,
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

	const defaultUesioFieldsBySFName = {
		Id: "uesio/core.id",
		// Defaults - these can be overridden
		Name: "uesio/core.uniquekey",
		CreatedDate: "uesio/core.createdat",
		LastModifiedDate: "uesio/core.updatedat",
	} as Record<string, string>
	const defaultSFFieldsByUesioName = Object.entries(
		defaultUesioFieldsBySFName
	).reduce(
		(acc: Record<string, string>, [sfName, uesioName]) => ({
			...acc,
			[uesioName]: sfName,
		}),
		{}
	)
	// Given a Salesforce Reference field id, e.g. "Job__c" or "AccountId",
	// return the relationship name, e.g. "Job__r" or "Account"
	const getRelationshipName = (sfField: string) =>
		sfField.includes("__c")
			? // Ignore more complex custom field extensions, just support __c for now.
			  sfField.split("__c")[0] + "__r"
			: // Strip off the "Id" suffix, e.g. "AccountId" => "Account"
			  // which is pretty standard for "standard" SF Fields, but yeah it's a hack.
			  // Ideally we'd have the full SF field DescribeFieldResult and use that.
			  sfField.substring(0, sfField.length - 2)

	const getUesioFieldBySalesforceName = (
		collectionKey: string,
		sfName: string
	) => {
		const collection = bot.getCollectionMetadata(collectionKey)
		if (collection) {
			const fieldId = collection.getFieldIdByExternalName(sfName)
			if (fieldId) {
				return fieldId
			}
		}
		// Use defaults as a last resort
		return defaultUesioFieldsBySFName[sfName]
	}
	const createUesioItemFromSalesforceRecord = (
		record: Record<string, FieldValue>,
		collectionName = collection
	) =>
		Object.entries(record).reduce(
			(acc: Record<string, FieldValue>, [sfField, value]) => {
				// Ignore special fields
				if (sfField === "attributes") return acc
				const uesioName = getUesioFieldBySalesforceName(
					collectionName,
					sfField
				)
				if (!uesioName) return acc
				if (value !== null && value !== undefined) {
					const fieldMetadata =
						collectionMetadata.getFieldMetadata(uesioName)
					if (fieldMetadata) {
						if (fieldMetadata.type === "TIMESTAMP") {
							// bot.log.info("sf TIMESTAMP value: " + value)
							const dateValue = Date.parse(value as string)
							if (dateValue) {
								value = dateValue / 1000
							} else {
								value = null
							}
							// bot.log.info("UESIO TIMESTAMP value: " + value)
						} else if (fieldMetadata.type === "REFERENCE") {
							const relName = getRelationshipName(sfField)
							const refCollection = fieldMetadata
								.getReferenceMetadata()
								?.getCollection()
							const relObject = record[relName] as Record<
								string,
								FieldValue
							>
							// We need to build an object containing the uesio/core.id field,
							// along with any other name / unique key fields we already have
							value = {
								...(relObject
									? createUesioItemFromSalesforceRecord(
											relObject,
											refCollection
									  )
									: {}),
								"uesio/core.id": value,
							}
							// TODO: Support multi-collection reference fields
						}
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
		fieldsSet = new Set(["Id"]),
		collectionName = collection,
		fieldIdPrefix = ""
	) => {
		// ALWAYS request the Id field
		if (fields && fields.length) {
			const collectionMeta = bot.getCollectionMetadata(collectionName)
			fields.forEach((f) => {
				const fieldMetadata = collectionMeta.getFieldMetadata(f.id)
				const sfFieldName = fieldMetadata
					? fieldMetadata.externalName
					: defaultSFFieldsByUesioName[f.id]
				if (sfFieldName) {
					// bot.log.info("uesio field id: " + f.id + ", sf field: " + sfFieldName)
					fieldsSet.add(`${fieldIdPrefix}${sfFieldName}`)
					if (f.fields && f.fields.length) {
						// If this is a Reference field, we need to populate the reference prefix,
						// and we need to use the related collection's field metadata
						const refMetadata =
							fieldMetadata?.getReferenceMetadata()
						if (refMetadata && refMetadata.getCollection()) {
							const newRefPrefix =
								fieldIdPrefix +
								getRelationshipName(sfFieldName) +
								"."
							// Make sure that the Id field is requested on the Reference field load.
							// The specific "Name" field should be requested by the user.
							fieldsSet.add(`${newRefPrefix}Id`)
							parseFieldRequests(
								f.fields,
								fieldsSet,
								refMetadata?.getCollection(),
								newRefPrefix
							)
						} else {
							parseFieldRequests(
								f.fields,
								fieldsSet,
								collectionName,
								fieldIdPrefix
							)
						}
					}
				}
			})
		} else {
			// If no other fields requested, add "Name"
			fieldsSet.add("Name")
		}
		return Array.from(fieldsSet.keys()).filter((f) => !!f)
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
		const sfFieldName = collectionMetadata.getExternalFieldName(field)
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
				.map((f) => collectionMetadata.getExternalFieldName(f))
				.filter((f) => !!f)
				.map(
					(sfField) =>
						`${sfField} LIKE '%${escapeSingleQuotes(
							value as string
						)}%'`
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
			.map((order) => [
				collectionMetadata.getExternalFieldName(order.field),
				order.desc,
			])
			.filter(([f]) => !!f)
			.map(([sfField, desc]) => `${sfField} ${desc ? "DESC" : "ASC"}`)
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
			response.status,
		response.body
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

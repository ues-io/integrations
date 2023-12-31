import { FieldValue, SaveBotApi } from "@uesio/bots"

type Subrequest = {
	body: object
	method: "POST" | "PUT" | "PATCH" | "GET" | "DELETE"
	url: string
	httpHeaders: Record<string, string>
	referenceId: string
}

type CompositeRequest = {
	allOrNone?: boolean
	collateSubrequests?: boolean
	compositeRequest: Subrequest[]
}

type SubrequestResult = {
	body: object
	httpHeaders: Record<string, string>
	httpStatusCode: number
	referenceId: string
}

type CompositeResponse = {
	compositeResponse: SubrequestResult[]
}

export default function clickup_folders_save(bot: SaveBotApi) {
	const { collectionMetadata } = bot.saveRequest
	const servicesPath = `/services/data/v59.0`
	const sobjectPath = `${servicesPath}/sobjects/${collectionMetadata.externalName}`
	const compositePath = `${bot
		.getIntegration()
		.getBaseURL()}${servicesPath}/composite`

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
			bot.log.info(
				"uesioFieldName: " +
					uesioFieldName +
					", fieldMetadata external name: " +
					fieldMetadata.externalName +
					", name: " +
					fieldMetadata.name
			)
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
				if (!uesioName) {
					return acc
				}
				const fieldMetadata =
					collectionMetadata.getFieldMetadata(uesioName)

				if (fieldMetadata && fieldMetadata.type === "TIMESTAMP") {
					value = Date.parse(value as string) / 1000
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

	const createSalesforceRecordFromUesioRecord = (
		uesioRecord: Record<string, FieldValue>,
		isUpdate = false
	) =>
		Object.entries(uesioRecord).reduce(
			(acc: Record<string, FieldValue>, [uesioField, value]) => {
				const sfName = salesforceFieldsByUesioName[uesioField]
				if (!sfName) {
					return acc
				}
				const fieldMetadata =
					collectionMetadata.getFieldMetadata(uesioField)
				if (
					sfName === "Id" ||
					(isUpdate && !fieldMetadata.updateable) ||
					(!isUpdate && !fieldMetadata.createable)
				) {
					return acc
				}
				if (fieldMetadata && fieldMetadata.type === "TIMESTAMP") {
					value = new Date(value as number).toISOString()
				}
				acc[sfName] = value
				// bot.log.info(
				// 	"sfField: " +
				// 		sfName +
				// 		", uesioField[" +
				// 		fieldMetadata?.type +
				// 		"]: " +
				// 		uesioField +
				// 		", value: " +
				// 		value
				// )
				return acc
			},
			{}
		)

	const subRequests = [] as Subrequest[]
	const compositeRequest = {
		allOrNone: true,
		compositeRequest: subRequests,
	} as CompositeRequest

	const sanitizeRefId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, "")
	const getDeleteRefId = (id: string) => sanitizeRefId(`delete_${id}`)
	const getInsertRefId = (id: string) => sanitizeRefId(`insert_${id}`)
	const getInsertQueryRefId = (id: string) =>
		sanitizeRefId(`insertquery_${id}`)
	const getUpdateRefId = (id: string) => sanitizeRefId(`update_${id}`)
	const getUpdateQueryRefId = (id: string) =>
		sanitizeRefId(`updatequery_${id}`)

	bot.deletes.get().forEach((deleteApi) => {
		const id = deleteApi.getId()
		const refId = getDeleteRefId(id)
		const subRequest = {
			method: "DELETE",
			url: `${sobjectPath}/${id}`,
			referenceId: refId,
		} as Subrequest
		subRequests.push(subRequest)
	})
	bot.inserts.get().forEach((insertApi) => {
		const id = insertApi.getId()
		const refId = getInsertRefId(id)
		const queryRefId = getInsertQueryRefId(id)
		const insertRequest = {
			method: "POST",
			url: sobjectPath,
			referenceId: refId,
			body: createSalesforceRecordFromUesioRecord(
				insertApi.getAll(),
				false
			),
		} as Subrequest
		// Also add a request to query for the inserted record, to get fields created after save
		const queryRequest = {
			method: "GET",
			url: `${sobjectPath}/@{${refId}.id}`,
			referenceId: queryRefId,
		} as Subrequest
		subRequests.push(insertRequest, queryRequest)
	})
	bot.updates.get().forEach((updateApi) => {
		const id = updateApi.getId()
		const refId = getUpdateRefId(id)
		const queryRefId = getUpdateQueryRefId(id)
		const updatedFields = updateApi.getAll()
		const sfUpdates = createSalesforceRecordFromUesioRecord(
			updatedFields,
			true
		)
		const updateRequest = {
			method: "PATCH",
			url: `${sobjectPath}/${id}`,
			referenceId: refId,
			body: sfUpdates,
		} as Subrequest
		// Also add a request to query for the updated record, to get fields created after save
		const queryRequest = {
			method: "GET",
			url: `${sobjectPath}/${id}?fields=${Object.keys(sfUpdates).join(
				","
			)}`,
			referenceId: queryRefId,
		} as Subrequest
		subRequests.push(updateRequest, queryRequest)
	})

	bot.log.info("compositeRequest", compositeRequest)

	const response = bot.http.request({
		method: "POST",
		url: compositePath,
		body: compositeRequest,
		headers: {
			"Content-Type": "application/json",
		},
	})

	bot.log.info(
		"[Salesforce SAVE Response]: " +
			response.code +
			", status=" +
			response.status
	)
	if (response.code !== 200) {
		let errMessage = ""
		let responseObj: Record<string, object>
		if (typeof response.body === "string") {
			//bot.log.info("response body is string")
			try {
				responseObj = JSON.parse(response.body as string)
				if (responseObj.error) {
					errMessage = responseObj.error as unknown as string
				}
				// eslint-disable-next-line no-empty
			} catch (e) {}
		} else {
			errMessage = response.body as unknown as string
		}
		if (errMessage) {
			bot.log.error("error from salesforce", errMessage)
		}
		// bot.addError(errMessage)
		return
	}
	const responseBody = response.body as CompositeResponse
	const resultsMap = {} as Record<string, SubrequestResult>
	responseBody.compositeResponse.forEach((subResult) => {
		bot.log.info("subResult", subResult)
		resultsMap[subResult.referenceId] = subResult
	})
	bot.log.info("resultsMap", resultsMap)
	// Now loop over our original requests again and record the results
	bot.deletes.get().forEach((deleteApi) => {
		const result = resultsMap[getDeleteRefId(deleteApi.getId())]
		if (result && result.httpStatusCode !== 204) {
			deleteApi.addError(JSON.stringify(result.body))
		}
	})
	bot.inserts.get().forEach((insertApi) => {
		const result = resultsMap[getInsertRefId(insertApi.getId())]
		if (result && result.httpStatusCode !== 201) {
			insertApi.addError(JSON.stringify(result.body))
		} else {
			// Update the record with the fields returned from the query
			const queryResult =
				resultsMap[getInsertQueryRefId(insertApi.getId())]
			if (queryResult) {
				const record = createUesioItemFromSalesforceRecord(
					queryResult.body as Record<string, FieldValue>
				)
				insertApi.setAll(record)
			}
		}
	})
	bot.updates.get().forEach((updateApi) => {
		const result = resultsMap[getUpdateRefId(updateApi.getId())]
		if (result && result.httpStatusCode !== 204) {
			updateApi.addError(JSON.stringify(result.body))
		} else {
			// Update the record with the fields returned from the query
			const queryResult =
				resultsMap[getUpdateQueryRefId(updateApi.getId())]
			if (queryResult) {
				const record = createUesioItemFromSalesforceRecord(
					queryResult.body as Record<string, FieldValue>
				)
				updateApi.setAll(record)
			}
		}
	})
}

import { FieldValue, LoadBotApi } from "@uesio/bots"

type TasksResponse = {
	tasks: Record<string, FieldValue>[]
}

export default function clickup_tasks_load(bot: LoadBotApi) {
	const { conditions, collectionMetadata, collection } = bot.loadRequest
	const namespace = collection.split(".")[0]
	// Build maps for quickly converting to/from Uesio/external field names
	const uesioFieldsByExternalName = {
		id: "uesio/core.id",
		date_created: "uesio/core.created_at",
		date_updated: "uesio/core.updated_at",
		list_id: `${namespace}.list->id`
	} as Record<string, string>
	Object.entries(collectionMetadata.getAllFieldMetadata()).forEach(
		([uesioFieldName, fieldMetadata]) => {
			// Only expose fields that have a defined external field name
			if (fieldMetadata.externalName) {
				uesioFieldsByExternalName[fieldMetadata.externalName] =
					uesioFieldName
			}
		}
	)
	// Invert the map
	const externalFieldsByUesioName = Object.entries(
		uesioFieldsByExternalName
	).reduce((acc, entry) => {
		const [externalField, uesioField] = entry
		acc[uesioField] = externalField
		return acc
	}, {} as Record<string, string>)

	const getUesioItemFromExternalRecord = (
		record: Record<string, FieldValue>
	) =>
		Object.entries(record).reduce(
			(acc: Record<string, FieldValue>, [externalField, value]) => {
				const uesioName = uesioFieldsByExternalName[externalField]
				if (!uesioName) {
					return acc
				}
				const fieldMetadata =
					collectionMetadata.getFieldMetadata(uesioName)
				if (value && fieldMetadata) {
					if (fieldMetadata.type === "TIMESTAMP") {
						const dateVal = Date.parse(value as string)
						if (dateVal) {
							value = dateVal / 1000
						} else {
							value = null
						}
					}
				}
				if (value !== undefined && value !== null) {
					acc[uesioName] = value
				}
				return acc
			},
			{}
		)
	// List id must be provided by conditions
	let listId
	const queryParams = ["archived=false"] as string[]
	const buildQueryStringConditions = () => {
		if (!conditions || !conditions.length) return
		conditions.forEach((condition) => {
			const { field, value } = condition
			if (!field) return true
			const externalFieldName = externalFieldsByUesioName[field]
			if (!externalFieldName) return
			// TODO: For now we assume all Conditions are of type fieldValue
			// Special case: "list->id", use this as the list id
			if (externalFieldName === "list_id") {
				listId = condition.value
				return
			}
			if (value === null || value === undefined) return
			const encodedValue = encodeURIComponent(value as string)
			switch (condition.operator) {
				case "GT":
				case "GTE":
					queryParams.push(`${externalFieldName}_gt=${encodedValue}`)
					break
				case "LT":
				case "LTE":
					queryParams.push(`${externalFieldName}_lt=${encodedValue}`)
					break
				case "IN":
					;(condition.values || [])
						.filter((v) => !!v)
						.forEach((value) => {
							queryParams.push(
								`${externalFieldName}[]=${encodeURIComponent(
									value as string
								)}`
							)
						})
					break
				default:
					queryParams.push(`${externalFieldName}=${encodedValue}`)
			}
		})
	}
	buildQueryStringConditions()

	if (!listId) {
		throw new Error(
			"Clickup Tasks Load Bot requires a list id condition to be set"
		)
	}

	const url = `${bot.getIntegration().getBaseURL()}/list/${listId}/task${
		queryParams.length ? "?" + queryParams.join("&") : ""
	}`

	const result = bot.http.request({
		method: "GET",
		url,
		headers: {
			"Content-Type": "application/json"
		}
	})

	if (result.code === 200) {
		;(result.body as TasksResponse).tasks.forEach((item) => {
			bot.addRecord(getUesioItemFromExternalRecord(item))
		})
	} else {
		bot.log.error(
			"result",
			result.code +
				", " +
				JSON.stringify(result.body) +
				", status: " +
				result.status
		)
		bot.addError("failed to fetch Tasks: " + result.status)
	}
}

import { FieldValue, LoadBotApi } from "@uesio/bots"

type TasksResponse = {
	tasks: Record<string, FieldValue>[]
}

type TypeConfigOption = {
	name: string
	orderindex: number
}

type TypeConfig = {
	options: TypeConfigOption[]
}

type CustomFieldResponse = {
	id: string
	name: string
	value: FieldValue
	type_config: TypeConfig
}

export default function clickup_tasks_load(bot: LoadBotApi) {
	const { conditions, collectionMetadata, collection } = bot.loadRequest
	const namespace = collection.split(".")[0]
	// Build maps for quickly converting to/from Uesio/external field names
	const uesioFieldsByExternalName = {
		id: "uesio/core.id",
		date_created: "uesio/core.created_at",
		date_updated: "uesio/core.updated_at",
		list_id: `${namespace}.list->id`,
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
				// Special handling for "custom_fields" - convert the list of custom field values
				// into a map so that each field can be easily accessed by its name
				if (
					externalField === "custom_fields" &&
					value &&
					Array.isArray(value as CustomFieldResponse[])
				) {
					acc[uesioName] = (value as CustomFieldResponse[]).reduce(
						(customFieldValues, customFieldResponse) => {
							customFieldValues[customFieldResponse.id] =
								customFieldResponse
							return customFieldValues
						},
						{} as Record<string, FieldValue>
					)
					return acc
				}
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
	// Either List id or Task Id must be provided by conditions
	let listId, taskId
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
			// Special case: "uesio/core.id", use this as the task id condition
			if (field === "uesio/core.id") {
				taskId = condition.value
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

	if (!listId && !taskId) {
		throw new Error(
			"querying Clickup Tasks requires either a list id or task id condition to be set"
		)
	}

	const url = `${bot.getIntegration().getBaseURL()}/${
		listId ? `list/${listId}/task` : `task/${taskId}`
	}${queryParams.length ? "?" + queryParams.join("&") : ""}`

	const result = bot.http.request({
		method: "GET",
		url,
		headers: {
			"Content-Type": "application/json",
		},
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

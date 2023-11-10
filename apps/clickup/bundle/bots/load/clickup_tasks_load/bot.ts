import { FieldValue, LoadBotApi } from "@uesio/bots"

type TasksResponse = {
	tasks: Record<string, FieldValue>[]
}

export default function clickup_tasks_load(bot: LoadBotApi) {
	const spaceID = bot.getCredentials().defaultSpaceId
	if (!spaceID) {
		throw new Error(
			"Default Clickup Space ID Config Value must be set. Please check your Site / Workspace settings."
		)
	}
	const { conditions, collectionMetadata, collection } = bot.loadRequest
	// Build maps for quickly converting to/from Uesio/external field names
	const uesioFieldsByExternalName = {
		id: "uesio/core.id",
		date_created: "uesio/core.created_at",
		date_updated: "uesio/core.updated_at",
		list_id: `${collection}.list->id`
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
				const fieldMetadata =
					collectionMetadata.getFieldMetadata(uesioName)
				if (fieldMetadata && fieldMetadata.type === "TIMESTAMP") {
					value = Date.parse(value as string) / 1000
				}
				acc[uesioName] = value
				return acc
			},
			{}
		)
	// List id must be provided by conditions
	let listId
	const qs = new URLSearchParams()
	const buildQueryStringConditions = () => {
		if (!conditions || !conditions.length) return
		conditions.forEach((condition) => {
			const { field } = condition
			if (!field) return true
			const externalFieldName = externalFieldsByUesioName[field]
			if (!externalFieldName) return
			// TODO: For now we assume all Conditions are of type fieldValue
			// Special case: "list->id", use this as the list id
			if (externalFieldName === "list_id") {
				listId = condition.value
				return
			}
			switch (condition.operator) {
				case "GT":
				case "GTE":
					qs.set(`${externalFieldName}_gt`, `${condition.value}`)
					break
				case "LT":
				case "LTE":
					qs.set(`${externalFieldName}_lt`, `${condition.value}`)
					break
				case "IN":
					;(condition.values || []).forEach((value) => {
						qs.append(`${externalFieldName}[]`, `${value}`)
					})
					break
				default:
					qs.append(externalFieldName, `${condition.value}`)
			}
		})
	}
	buildQueryStringConditions()
	const queryString = qs.toString()

	if (!listId) {
		throw new Error(
			"Clickup Tasks Load Bot requires a list id condition to be set"
		)
	}

	const url = `${bot
		.getIntegration()
		.getBaseURL()}/space/${spaceID}/list/${listId}/task${
		queryString.length ? "?" + queryString : ""
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
		bot.addError("failed to fetch Tasks: " + result.status)
	}
}

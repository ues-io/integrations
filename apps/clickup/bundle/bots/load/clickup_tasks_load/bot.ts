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
	const { conditions, collectionMetadata } = bot.loadRequest
	// Build maps for quickly converting to/from Uesio/external field names
	const uesioFieldsByExternalName = {
		id: "uesio/core.id"
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

	const url = `${bot
		.getIntegration()
		.getBaseURL()}/space/${spaceID}/list/${listId}/task?archived=false&include_markdown_description=true&page=0&order_by=string&reverse=true&subtasks=true&statuses=string&include_closed=true&assignees=string&tags=string&due_date_gt=0&due_date_lt=0&date_created_gt=0&date_created_lt=0&date_updated_gt=0&date_updated_lt=0&date_done_gt=0&date_done_lt=0&custom_fields=string'`

	const result = bot.http.request({
		method: "GET",
		url,
		headers: {
			"Content-Type": "application/json"
		}
	})

	if (result.code === 200) {
		const filter = (item: Record<string, unknown>) => {
			if (!conditions || !conditions.length) return true
			return conditions.every((condition) => {
				const { field } = condition
				if (!field) return true
				const externalFieldName = externalFieldsByUesioName[field]
				// TODO: For now we assume all Conditions are of type fieldValue
				const fieldValue = item[externalFieldName]
				switch (condition.operator) {
					case "NOT_EQ":
						return fieldValue !== condition.value
					case "GT":
						return fieldValue ?? 0 > (condition.value ?? 0)
					case "LT":
						return fieldValue ?? 0 < (condition.value ?? 0)
					case "LTE":
						return fieldValue ?? 0 <= (condition.value ?? 0)
					case "GTE":
						return fieldValue ?? 0 <= (condition.value ?? 0)
					default:
						return fieldValue === condition.value
				}
			})
		}
		;(result.body as TasksResponse).tasks.filter(filter).forEach((item) => {
			bot.addRecord(getUesioItemFromExternalRecord(item))
		})
	} else {
		bot.addError("failed to fetch folders: " + result.status)
	}
}

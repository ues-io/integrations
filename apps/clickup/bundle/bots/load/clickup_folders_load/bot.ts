import { FieldValue, LoadBotApi } from "@uesio/bots"

type FoldersResponse = {
	folders: Record<string, FieldValue>[]
}

export default function clickup_folders_load(bot: LoadBotApi) {
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
		.getBaseURL()}/space/${spaceID}/folder?archived=false`

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
		;(result.body as FoldersResponse).folders
			.filter(filter)
			.forEach((item) => {
				bot.addRecord(getUesioItemFromExternalRecord(item))
			})
	} else {
		bot.addError("failed to fetch folders: " + result.status)
	}
}

import { FieldValue, LoadBotApi } from "@uesio/bots"

type FoldersResponse = {
	folders: Record<string, FieldValue>[]
}

export default function clickup_folders_load(bot: LoadBotApi) {
	const { conditions, collectionMetadata } = bot.loadRequest
	// Build maps for quickly converting to/from Uesio/external field names
	const uesioFieldsByExternalName = {
		id: "uesio/core.id",
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
				if (value !== null && value !== undefined) {
					const fieldMetadata =
						collectionMetadata.getFieldMetadata(uesioName)
					if (fieldMetadata && fieldMetadata.type === "TIMESTAMP") {
						const dateValue = Date.parse(value as string)
						if (dateValue) {
							value = dateValue / 1000
						} else {
							value = null
						}
					}
				}
				acc[uesioName] = value
				return acc
			},
			{}
		)

	let spaceID = bot.getCredentials().defaultSpaceId

	// See if there is a Condition that specifies a particular space id
	if (conditions && conditions.length) {
		const spaceIdCondition = conditions.find(
			(condition) =>
				condition.field === "space.id" &&
				condition.operator === "EQ" &&
				!!condition.value
		)
		if (spaceIdCondition) {
			spaceID = spaceIdCondition.value as string
		}
	}

	if (!spaceID) {
		throw new Error(
			"A valid space id is required, but no condition on space.id was provided, nor was a default Clickup Space ID Config Value found."
		)
	}

	const url = `${bot
		.getIntegration()
		.getBaseURL()}/space/${spaceID}/folder?archived=false`

	const result = bot.http.request({
		method: "GET",
		url,
		headers: {
			"Content-Type": "application/json",
		},
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

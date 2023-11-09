import { LoadBotApi } from "@uesio/bots"

type List = object

type Folder = {
	id: number
	name: string
	archived: boolean
	task_count: number
	lists: List[]
}

type FoldersResponse = {
	folders: Folder[]
}

export default function clickup_folders_load(bot: LoadBotApi) {
	const spaceID = bot.getConfigValue("default_clickup_space_id")
	if (!spaceID) {
		bot.addError(
			"Default Clickup Space ID Config Value must be set. Please check your Site / Workspace settings."
		)
		return
	}

	const { conditions } = bot.loadRequest

	const result = bot.http.request({
		method: "GET",
		url: `${bot
			.getIntegration()
			.getBaseURL()}/space/${spaceID}/folder?archived=false`
	})

	if (result.code === 200) {
		const folderFilter = (folder: Folder) => {
			if (!conditions || !conditions.length) return true
			return conditions.every((condition) => {
				const { field } = condition
				if (!field) return true
				const compareField = field.includes(".")
					? field?.split(".")[1]
					: field
				// TODO: For now we assume all Conditions are of type fieldValue
				const fieldValue = folder[compareField as keyof Folder]
				switch (condition.operator) {
					case "NOT_EQ":
						return fieldValue !== condition.value
					case "GT":
						return fieldValue > (condition.value ?? 0)
					case "LT":
						return fieldValue < (condition.value ?? 0)
					case "LTE":
						return fieldValue <= (condition.value ?? 0)
					case "GTE":
						return fieldValue <= (condition.value ?? 0)
					default:
						return fieldValue === condition.value
				}
			})
		}
		;(result.body as FoldersResponse).folders
			.filter(folderFilter)
			.forEach((folder) => {
				bot.addRecord({
					"uesio/core.id": folder.id,
					name: folder.name,
					archived: folder.archived,
					lists: folder.lists,
					task_count: folder.task_count
				})
			})
	} else {
		bot.addError("failed to fetch folders: " + result.status)
	}
}

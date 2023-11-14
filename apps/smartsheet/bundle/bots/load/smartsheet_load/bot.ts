import { FieldValue, LoadBotApi } from "@uesio/bots"

type SheetColumn = {
	id: string
}

type SheetCell = {
	columnId: string
	displayValue: string
	value: string
}

type SheetRow = {
	id: string
	cells: SheetCell[]
}

type SheetResponse = {
	columns: SheetColumn[]
	rows: SheetRow[]
}

export default function smartsheet_load(bot: LoadBotApi) {
	const { collectionMetadata } = bot.loadRequest
	const url =
		"https://api.smartsheet.com/2.0/sheets/" +
		collectionMetadata.externalName
	const response = bot.http.request({
		method: "GET",
		url,
	})
	const body = response.body as SheetResponse
	const fieldsMetadata = collectionMetadata.getAllFieldMetadata()
	const fields: typeof fieldsMetadata = {}
	Object.keys(fieldsMetadata).forEach((key) => {
		const fieldMetadata = fieldsMetadata[key]
		if (fieldMetadata.externalName) {
			fields[fieldMetadata.externalName] = fieldMetadata
		}
	})

	body.rows.forEach((row) => {
		const record: Record<string, FieldValue> = {
			"uesio/core.id": row.id + "",
		}

		row.cells.forEach((cell) => {
			const field = fields[cell.columnId]
			if (field) {
				record[field.namespace + "." + field.name] = cell.value
			}
		})
		bot.addRecord(record)
	})
}

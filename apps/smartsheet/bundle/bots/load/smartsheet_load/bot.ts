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
	rows: SheetRow[] | undefined
}

export default function smartsheet_load(bot: LoadBotApi) {
	const {
		batchNumber = 0,
		batchSize,
		collectionMetadata,
		conditions,
	} = bot.loadRequest
	const queryParams = {} as Record<string, FieldValue>
	const doPagination = typeof batchSize === "number" && batchSize > 0
	if (doPagination) {
		// SmartSheet pagination uses 1-based indexing
		queryParams.page = batchNumber + 1
		// Always add one to to the batch size to determine if there are more records
		queryParams.pageSize = batchSize + 1
	} else {
		queryParams.includeAll = true
	}

	// Transform Conditions on the Uesio Core Id into row Id filters
	const rowIdCondition = conditions?.find(
		(condition) => condition.field === "uesio/core.id"
	)
	if (rowIdCondition) {
		if (rowIdCondition.operator === "IN" && rowIdCondition.values?.length) {
			queryParams.rowIds = rowIdCondition.values.join(",")
		} else if (rowIdCondition.operator === "EQ" && rowIdCondition.value) {
			queryParams.rowIds = rowIdCondition.value
		}
	}

	const queryString = Object.entries(queryParams)
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(`${value}`)}`
		)
		.join("&")

	const url = `https://api.smartsheet.com/2.0/sheets/${collectionMetadata.externalName}?${queryString}`

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

	const maxRecordForPagination = doPagination
		? (queryParams.pageSize as number) - 1
		: -1
	body.rows?.forEach((row, i) => {
		// If we are on the final row, do NOT add it to the bot's records,
		// since we requested one more than we needed, but DO set has more records
		// so that Uesio pagination controls will work
		if (doPagination && i === maxRecordForPagination) {
			bot.setHasMoreRecords()
			return
		}
		const record: Record<string, FieldValue> = {
			"uesio/core.id": row.id + "",
		}

		row.cells?.forEach((cell) => {
			const field = fields[cell.columnId]
			if (field) {
				record[field.namespace + "." + field.name] = cell.value
			}
		})
		bot.addRecord(record)
	})
}

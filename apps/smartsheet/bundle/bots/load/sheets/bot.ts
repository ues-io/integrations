import { FieldValue, LoadBotApi } from "@uesio/bots"

type Sheet = {
	id: number
	name: string
	columns?: Column[]
}

type Column = {
	id: number
	index: string
	title: string
	type: string
}

type SheetResponse = {
	data: Sheet[]
}

export default function smartsheet_load(bot: LoadBotApi) {
	const { batchNumber = 0, batchSize, conditions } = bot.loadRequest
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

	let url = "https://api.smartsheet.com/2.0/sheets"
	let isSingleSheet = false

	if (rowIdCondition?.value) {
		isSingleSheet = true
		url = url + "/" + rowIdCondition.value + "?rowNumbers=0"
	}

	if (rowIdCondition?.values) {
		isSingleSheet = true
		url = url + "/" + rowIdCondition.values[0] + "?rowNumbers=0"
	}

	const response = bot.http.request({
		method: "GET",
		url,
	})

	if (isSingleSheet) {
		const sheet = response.body as Sheet

		if (!sheet) return
		const record: Record<string, FieldValue> = {
			"uesio/core.id": sheet.id + "",
			"uesio/smartsheet.name": sheet.name,
			"uesio/smartsheet.columns": sheet.columns as FieldValue,
		}
		bot.addRecord(record)

		return
	}
	const body = response.body as SheetResponse
	body.data?.forEach((row) => {
		const record: Record<string, FieldValue> = {
			"uesio/core.id": row.id + "",
			"uesio/smartsheet.name": row.name,
		}
		bot.addRecord(record)
	})
}

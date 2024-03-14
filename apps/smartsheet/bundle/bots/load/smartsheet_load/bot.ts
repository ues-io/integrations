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

type Mapping = {
	"uesio/smartsheet.sheet": {
		"uesio/core.id": string
	}
	"uesio/smartsheet.fields": Record<string, unknown>
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

	const collectionFullName =
		collectionMetadata.namespace + "." + collectionMetadata.name

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

	// Get the sheet id from the mapping record
	const mappingResult = bot.load({
		collection: "uesio/smartsheet.mapping",
		fields: [
			{
				id: "uesio/smartsheet.fields",
			},
			{
				id: "uesio/smartsheet.sheet",
			},
		],
		conditions: [
			{
				field: "collection",
				operator: "EQ",
				value: collectionFullName,
			},
		],
	})?.[0] as Mapping

	if (!mappingResult) {
		throw new Error(
			"Smartsheet load failed: No mapping provided for collection: " +
				collectionFullName
		)
	}

	const sheetId = mappingResult["uesio/smartsheet.sheet"]["uesio/core.id"]

	const fieldMappings = mappingResult["uesio/smartsheet.fields"]

	const url = `https://api.smartsheet.com/2.0/sheets/${sheetId}?${queryString}`

	const response = bot.http.request({
		method: "GET",
		url,
	})
	const body = response.body as SheetResponse
	const fieldsMetadata = collectionMetadata.getAllFieldMetadata()

	const fieldsByColumn = Object.fromEntries(
		Object.entries(fieldsMetadata).flatMap(([key, fieldMetadata]) => {
			const mappingValue = fieldMappings[key]
			if (!mappingValue) {
				return []
			}
			if (fieldMetadata.type === "MAP") {
				const mappings = mappingValue as Record<string, string>
				return Object.entries(mappings).map(([path, columnId]) => [
					columnId,
					{
						path,
						metadata: fieldMetadata,
					},
				])
			}
			return [
				[
					mappingValue,
					{
						path: "",
						metadata: fieldMetadata,
					},
				],
			]
		})
	)

	const set = (
		obj: Record<string, unknown>,
		path: string[],
		value: unknown
	) => {
		path.reduce((acc, key, i) => {
			if (acc[key] === undefined) acc[key] = {}
			if (i === path.length - 1) acc[key] = value
			return acc[key]
		}, obj)
	}

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
			const fieldInfo = fieldsByColumn[cell.columnId]
			const metadata = fieldInfo?.metadata
			if (metadata) {
				const fieldKey = metadata.namespace + "." + metadata.name
				if (metadata.type === "MAP") {
					let existing = record[fieldKey] as Record<string, unknown>
					if (!existing) {
						record[fieldKey] = {}
						existing = record[fieldKey] as Record<string, unknown>
					}
					set(existing, fieldInfo.path.split("->"), cell.value)
					record[fieldKey] = existing
				} else {
					record[fieldKey] = cell.value
				}
			}
		})
		bot.addRecord(record)
	})
}

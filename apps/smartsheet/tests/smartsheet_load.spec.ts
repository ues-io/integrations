import { FieldValue, LoadBotApi, LoadRequestMetadata } from "@uesio/bots"
import smartsheet_load from "../bundle/bots/load/smartsheet_load/bot"

const smartSheetBaseUrl = "https://api.smartsheet.com/2.0/sheets"
const sheetId = "somesheetid"
const nameColumnId = "nameColumnID"
const statusColumnId = "statusColumnID"

const sampleUesioCollectionName = "tasks"
const sampleUesioNS = "luigi/foo"
const mockBot = (
	returnRecords?: Record<string, FieldValue>[],
	loadRequest?: Partial<LoadRequestMetadata>
) => ({
	loadRequest: {
		collection: `${sampleUesioNS}.${sampleUesioCollectionName}`,
		collectionMetadata: getSampleCollectionMetadata(),
		...(loadRequest || {}),
	},
	load: jest.fn(),
	addRecord: jest.fn(),
	setHasMoreRecords: jest.fn(),
	http: {
		request: jest.fn(() => ({
			code: 200,
			body: {
				rows: returnRecords,
			},
		})),
	},
})

const row1 = {
	id: 1,
	cells: [
		{
			columnId: nameColumnId,
			displayValue: "Test",
			value: "Test",
		},
		{
			columnId: statusColumnId,
			displayValue: "In Progress",
			value: "in_progress",
		},
	],
}
const row2 = {
	id: 2,
	cells: [
		{
			columnId: nameColumnId,
			displayValue: "Another test",
			value: "Another test",
		},
		{
			columnId: statusColumnId,
			displayValue: "Completed",
			value: "completed",
		},
	],
}

const getSampleCollectionMetadata = () => ({
	name: sampleUesioCollectionName,
	namespace: sampleUesioNS,
	getAllFieldMetadata: jest.fn(() => ({
		"uesio/smartsheet.name": {
			name: "name",
			namespace: "uesio/smartsheet",
		},
		"uesio/smartsheet.status": {
			name: "status",
			namespace: "uesio/smartsheet",
		},
	})),
})
const uesioRow1 = {
	"uesio/core.id": "1",
	"uesio/smartsheet.name": "Test",
	"uesio/smartsheet.status": "in_progress",
}
const uesioRow2 = {
	"uesio/core.id": "2",
	"uesio/smartsheet.name": "Another test",
	"uesio/smartsheet.status": "completed",
}

const sampleMapping = [
	{
		"uesio/smartsheet.sheet": {
			"uesio/core.id": sheetId,
		},
		"uesio/smartsheet.fields": {
			["uesio/smartsheet.name"]: nameColumnId,
			["uesio/smartsheet.status"]: statusColumnId,
		},
	},
]

describe("Smartsheet Load", () => {
	it("should fail of no mapping was found", () => {
		const bot = mockBot([row1, row2])
		bot.load.mockReturnValue([])
		expect(() => {
			smartsheet_load(bot as unknown as LoadBotApi)
		}).toThrow(
			"Smartsheet load failed: No mapping provided for collection: luigi/foo.tasks"
		)
	})
	it("should load data from Smartsheet", () => {
		const bot = mockBot([row1, row2])
		bot.load.mockReturnValue(sampleMapping)
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url: `${smartSheetBaseUrl}/${sheetId}?includeAll=true`,
		})
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
	})
	it("should not bomb if no rows or cells are returned", () => {
		let bot = mockBot(undefined)
		bot.load.mockReturnValue(sampleMapping)
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledTimes(0)
		bot = mockBot([
			{
				id: "123",
			},
		])
		bot.load.mockReturnValue(sampleMapping)
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith({
			"uesio/core.id": "123",
		})
	})
	it("should only return specific rows from a sheet if uesio/core.id condition exists (multi-value)", () => {
		const bot = mockBot([row1, row2], {
			batchSize: 10,
			batchNumber: 0,
			conditions: [
				{
					field: "uesio/core.id",
					operator: "IN",
					values: ["1", "2"],
				},
			],
		})
		bot.load.mockReturnValue(sampleMapping)
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
		// We asked for up to 10 records, but only got back 2, so there are no more records available
		expect(bot.setHasMoreRecords).toHaveBeenCalledTimes(0)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url: `${smartSheetBaseUrl}/${sheetId}?page=1&pageSize=11&rowIds=1%2C2`,
		})
	})
	it("should only return one row from a sheet if uesio/core.id condition exists (single-value)", () => {
		const bot = mockBot([row2], {
			batchSize: 1,
			batchNumber: 0,
			conditions: [
				{
					field: "uesio/core.id",
					operator: "EQ",
					value: "2",
				},
			],
		})
		bot.load.mockReturnValue(sampleMapping)
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
		// We asked for up to 1 records, but only got back 1, so there are no more records available
		expect(bot.setHasMoreRecords).toHaveBeenCalledTimes(0)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url: `${smartSheetBaseUrl}/${sheetId}?page=1&pageSize=2&rowIds=2`,
		})
	})
	it("should indicate that there are more records available from server", () => {
		const bot = mockBot([row1, row2], {
			batchSize: 1,
			batchNumber: 0,
		})
		bot.load.mockReturnValue(sampleMapping)
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		// We asked for up to 1 records, and got back 2, so there ARE records available
		expect(bot.setHasMoreRecords).toHaveBeenCalled()
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url: `${smartSheetBaseUrl}/${sheetId}?page=1&pageSize=2`,
		})
	})
})

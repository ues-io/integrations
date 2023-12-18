import { FieldValue, LoadBotApi, LoadRequestMetadata } from "@uesio/bots"
import smartsheet_load from "../bundle/bots/load/smartsheet_load/bot"

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
			columnId: "taskname",
			displayValue: "Test",
			value: "Test",
		},
		{
			columnId: "taskstatus",
			displayValue: "In Progress",
			value: "in_progress",
		},
	],
}
const row2 = {
	id: 2,
	cells: [
		{
			columnId: "taskname",
			displayValue: "Another test",
			value: "Another test",
		},
		{
			columnId: "taskstatus",
			displayValue: "Completed",
			value: "completed",
		},
	],
}

const smartSheetBaseUrl = "https://api.smartsheet.com/2.0/sheets"
const sheetId = "somesheetid"

const getSampleCollectionMetadata = () => ({
	externalName: sheetId,
	getAllFieldMetadata: jest.fn(() => ({
		"uesio/smartsheet.name": {
			externalName: "taskname",
			name: "name",
			namespace: "uesio/smartsheet",
		},
		"uesio/smartsheet.status": {
			externalName: "taskstatus",
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

describe("Smartsheet Load", () => {
	it("should load data from Smartsheet", () => {
		const bot = mockBot([row1, row2])
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
	})
	it("should not bomb if no rows or cells are returned", () => {
		let bot = mockBot(undefined)
		smartsheet_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledTimes(0)
		bot = mockBot([
			{
				id: "123",
			},
		])
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

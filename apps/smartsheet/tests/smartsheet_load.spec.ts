import { LoadBotApi } from "@uesio/bots"
import smartsheet_load from "../bundle/bots/load/smartsheet_load/bot"

const row1 = {
	id: 1,
	cells: [
		{
			columnId: "taskname",
			displayValue: "Test",
			value: "Test"
		},
		{
			columnId: "taskstatus",
			displayValue: "In Progress",
			value: "in_progress"
		}
	]
}
const row2 = {
	id: 2,
	cells: [
		{
			columnId: "taskname",
			displayValue: "Another test",
			value: "Another test"
		},
		{
			columnId: "taskstatus",
			displayValue: "Completed",
			value: "completed"
		}
	]
}

const getSampleCollectionMetadata = () => ({
	externalName: "somesheetid",
	getAllFieldMetadata: jest.fn(() => ({
		"uesio/smartsheet.name": {
			externalName: "taskname",
			name: "name",
			namespace: "uesio/smartsheet"
		},
		"uesio/smartsheet.status": {
			externalName: "taskstatus",
			name: "status",
			namespace: "uesio/smartsheet"
		}
	}))
})
const uesioRow1 = {
	"uesio/core.id": "1",
	"uesio/smartsheet.name": "Test",
	"uesio/smartsheet.status": "in_progress"
}
const uesioRow2 = {
	"uesio/core.id": "2",
	"uesio/smartsheet.name": "Another test",
	"uesio/smartsheet.status": "completed"
}

describe("Smartsheet Load", () => {
	it("should load data from Smartsheet", () => {
		const addRecord = jest.fn()
		const bot = {
			loadRequest: {
				collectionMetadata: getSampleCollectionMetadata()
			},
			addRecord,
			http: {
				request: jest.fn(() => ({
					code: 200,
					body: {
						rows: [row1, row2]
					}
				}))
			}
		}

		smartsheet_load(bot as unknown as LoadBotApi)

		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
	})
	it("should only return specific rows from a sheet if uesio/core.id condition exists (multi-value)", () => {
		const addRecord = jest.fn()
		const request = jest.fn(() => ({
			code: 200,
			body: {
				rows: [row1, row2]
			}
		}))
		const bot = {
			loadRequest: {
				batchSize: 1,
				batchNumber: 0,
				collectionMetadata: getSampleCollectionMetadata(),
				conditions: [
					{
						field: "uesio/core.id",
						operator: "IN",
						values: ["1", "2"]
					}
				]
			},
			addRecord,
			http: {
				request
			}
		}

		smartsheet_load(bot as unknown as LoadBotApi)

		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)

		expect(request).toHaveBeenCalledWith({
			method: "GET",
			url: "https://api.smartsheet.com/2.0/sheets/somesheetid?page=1&pageSize=1&rowIds=1%2C2"
		})
	})
	it("should only return one row from a sheet if uesio/core.id condition exists (single-value)", () => {
		const addRecord = jest.fn()
		const request = jest.fn(() => ({
			code: 200,
			body: {
				rows: [row2]
			}
		}))
		const bot = {
			loadRequest: {
				batchSize: 1,
				batchNumber: 0,
				collectionMetadata: getSampleCollectionMetadata(),
				conditions: [
					{
						field: "uesio/core.id",
						operator: "EQ",
						value: "2"
					}
				]
			},
			addRecord,
			http: {
				request
			}
		}

		smartsheet_load(bot as unknown as LoadBotApi)

		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)

		expect(request).toHaveBeenCalledWith({
			method: "GET",
			url: "https://api.smartsheet.com/2.0/sheets/somesheetid?page=1&pageSize=1&rowIds=2"
		})
	})
})

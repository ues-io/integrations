import { FieldValue, LoadBotApi, LoadRequestMetadata } from "@uesio/bots"
import stripe_load from "../bundle/bots/load/stripe_load/bot"

const sampleUesioCollectionName = "tasks"
const sampleUesioNS = "luigi/foo"
const mockBot = (
	returnRecords: Record<string, FieldValue>[],
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

const stripeBaseUrl = "https://api.stripe.com/2.0/sheets"
const sheetId = "somesheetid"

const getSampleCollectionMetadata = () => ({
	externalName: sheetId,
	getAllFieldMetadata: jest.fn(() => ({
		"uesio/stripe.name": {
			externalName: "taskname",
			name: "name",
			namespace: "uesio/stripe",
		},
		"uesio/stripe.status": {
			externalName: "taskstatus",
			name: "status",
			namespace: "uesio/stripe",
		},
	})),
})
const uesioRow1 = {
	"uesio/core.id": "1",
	"uesio/stripe.name": "Test",
	"uesio/stripe.status": "in_progress",
}
const uesioRow2 = {
	"uesio/core.id": "2",
	"uesio/stripe.name": "Another test",
	"uesio/stripe.status": "completed",
}

describe("Stripe Load", () => {
	it("should load data from Stripe", () => {
		const bot = mockBot([row1, row2])
		stripe_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
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
		stripe_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
		// We asked for up to 10 records, but only got back 2, so there are no more records available
		expect(bot.setHasMoreRecords).toHaveBeenCalledTimes(0)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url: `${stripeBaseUrl}/${sheetId}?page=1&pageSize=11&rowIds=1%2C2`,
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
		stripe_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
		// We asked for up to 1 records, but only got back 1, so there are no more records available
		expect(bot.setHasMoreRecords).toHaveBeenCalledTimes(0)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url: `${stripeBaseUrl}/${sheetId}?page=1&pageSize=2&rowIds=2`,
		})
	})
	it("should indicate that there are more records available from server", () => {
		const bot = mockBot([row1, row2], {
			batchSize: 1,
			batchNumber: 0,
		})
		stripe_load(bot as unknown as LoadBotApi)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		// We asked for up to 1 records, and got back 2, so there ARE records available
		expect(bot.setHasMoreRecords).toHaveBeenCalled()
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url: `${stripeBaseUrl}/${sheetId}?page=1&pageSize=2`,
		})
	})
})

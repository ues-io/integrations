// import { FieldValue, RunActionBotApi, LoadRequestMetadata } from "@uesio/bots"
// import checkout from "../bundle/bots/runaction/checkout/bot"

// const sampleUesioCollectionName = "tasks"
// const sampleUesioNS = "luigi/foo"
// const mockBot = (
// 	returnRecords: Record<string, FieldValue>[],
// 	loadRequest?: Partial<LoadRequestMetadata>
// ) => ({
// 	loadRequest: {
// 		collection: `${sampleUesioNS}.${sampleUesioCollectionName}`,
// 		collectionMetadata: getSampleCollectionMetadata(),
// 		...(loadRequest || {}),
// 	},
// 	addRecord: jest.fn(),
// 	setHasMoreRecords: jest.fn(),
// 	http: {
// 		request: jest.fn(() => ({
// 			code: 200,
// 			body: {
// 				rows: returnRecords,
// 			},
// 		})),
// 	},
// })

// const row1 = {
// 	id: 1,
// 	cells: [
// 		{
// 			columnId: "taskname",
// 			displayValue: "Test",
// 			value: "Test",
// 		},
// 		{
// 			columnId: "taskstatus",
// 			displayValue: "In Progress",
// 			value: "in_progress",
// 		},
// 	],
// }
// const row2 = {
// 	id: 2,
// 	cells: [
// 		{
// 			columnId: "taskname",
// 			displayValue: "Another test",
// 			value: "Another test",
// 		},
// 		{
// 			columnId: "taskstatus",
// 			displayValue: "Completed",
// 			value: "completed",
// 		},
// 	],
// }

// const stripeBaseUrl = "https://api.stripe.com/2.0/sheets"
// const sheetId = "somesheetid"

// const getSampleCollectionMetadata = () => ({
// 	externalName: sheetId,
// 	getAllFieldMetadata: jest.fn(() => ({
// 		"uesio/stripe.name": {
// 			externalName: "taskname",
// 			name: "name",
// 			namespace: "uesio/stripe",
// 		},
// 		"uesio/stripe.status": {
// 			externalName: "taskstatus",
// 			name: "status",
// 			namespace: "uesio/stripe",
// 		},
// 	})),
// })
// const uesioRow1 = {
// 	"uesio/core.id": "1",
// 	"uesio/stripe.name": "Test",
// 	"uesio/stripe.status": "in_progress",
// }
// const uesioRow2 = {
// 	"uesio/core.id": "2",
// 	"uesio/stripe.name": "Another test",
// 	"uesio/stripe.status": "completed",
// }

// describe("Stripe Load", () => {
// 	it("should load data from Stripe", () => {
// 		const bot = mockBot([row1, row2])
// 		checkout(bot as unknown as RunActionBotApi)
// 		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
// 		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
// 	})
// })

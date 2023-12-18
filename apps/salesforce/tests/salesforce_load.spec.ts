import { FieldValue, LoadBotApi, LoadRequestMetadata } from "@uesio/bots"
import salesforce_load from "../bundle/bots/load/salesforce_load/bot"

const sfRow1 = {
	Id: "001000010000100AAA",
	Name: "Genepoint",
	Type: "Customer - Channel",
}
const sfRow2 = {
	Id: "001000010000100ABC",
	Name: "United Oil & Gas, UK",
	Type: "Customer - Partner",
}
const sfRow3 = {
	Id: "001000010000100CCC",
	Name: "Some other channel account",
	ParentId: "001000010000100AAA",
	Parent: { ...sfRow1 },
	Type: "Customer - Channel",
}
const uesioRow1 = {
	"uesio/core.id": "001000010000100AAA",
	"luigi/foo.name": "Genepoint",
	"luigi/foo.type": "Customer - Channel",
}
const uesioRow2 = {
	"uesio/core.id": "001000010000100ABC",
	"luigi/foo.name": "United Oil & Gas, UK",
	"luigi/foo.type": "Customer - Partner",
}
const uesioRow3 = {
	"uesio/core.id": "001000010000100CCC",
	"luigi/foo.name": "United Oil & Gas, UK",
	"luigi/foo.type": "Customer - Partner",
	"luigi/foo.parent": {
		"uesio/core.id": "001000010000100AAA",
		"luigi/foo.name": "Genepoint",
	},
}

const nameFieldMetadata = {
	externalName: "Name",
	name: "name",
	type: "TEXT",
	namespace: "luigi/foo",
}
const typeFieldMetadata = {
	externalName: "Type",
	name: "type",
	type: "TEXT",
	namespace: "luigi/foo",
}
const parentFieldMetadata = {
	externalName: "ParentId",
	name: "Parent",
	type: "REFERENCE",
	namespace: "luigi/foo",
	reference: {
		collection: "luigi/foo.account",
	},
}
const coreIdFieldMetadata = {
	externalName: "Id",
	name: "id",
	type: "TEXT",
	namespace: "uesio/core",
}

const sampleUesioCollectionName = "account"
const sampleSalesforceCollectionName = "Account"

const getSampleCollectionMetadata = () => ({
	name: sampleUesioCollectionName,
	namespace: "luigi/foo",
	externalName: sampleSalesforceCollectionName,
	getAllFieldMetadata: jest.fn(() => ({
		"luigi/foo.name": nameFieldMetadata,
		"luigi/foo.type": typeFieldMetadata,
		"luigi/foo.parent": parentFieldMetadata,
		"uesio/core.id": coreIdFieldMetadata,
	})),
	getFieldMetadata: jest.fn((fieldName) => {
		switch (fieldName) {
			case "luigi/foo.name":
				return nameFieldMetadata
			case "luigi/foo.type":
				return typeFieldMetadata
			case "luigi/foo.parent":
				return parentFieldMetadata
			case "uesio/core.id":
				return coreIdFieldMetadata
			default:
				return undefined
		}
	}),
})

const baseUrl = "https://uesioinc-dev-ed.my.salesforce.com"

const mockBot = (
	returnRecords: Record<string, FieldValue>[],
	loadRequest: Partial<LoadRequestMetadata>
) => ({
	log: {
		info: jest.fn(),
	},
	getCredentials: jest.fn(() => ({
		baseUrl,
	})),
	loadRequest: {
		collection: `luigi/foo.${sampleUesioCollectionName}`,
		collectionMetadata: getSampleCollectionMetadata(),
		...loadRequest,
	},
	addRecord: jest.fn(),
	setHasMoreRecords: jest.fn(),
	http: {
		request: jest.fn(() => ({
			code: 200,
			body: {
				totalSize: returnRecords.length,
				done: true,
				records: returnRecords,
			},
		})),
	},
})

describe("Salesforce Load", () => {
	it("should load data using default fields and batch size if not provided", () => {
		const bot = mockBot([sfRow1, sfRow2], {})

		salesforce_load(bot as unknown as LoadBotApi)

		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow2)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url:
				baseUrl +
				"/services/data/v59.0/query/?q=SELECT%20Id%2CName%20FROM%20Account%20LIMIT%20101",
		})
	})
	it("should load data, querying for just the specific fields requested, and batch size if provided", () => {
		const bot = mockBot([sfRow1, sfRow3], {
			fields: [
				{
					id: "luigi/foo.name",
				},
				{
					id: "luigi/foo.type",
				},
				{
					id: "uesio/core.id",
				},
			],
			conditions: [
				{
					field: "luigi/foo.type",
					operator: "EQ",
					value: "Customer - Channel",
				},
			],
			batchSize: 1,
			batchNumber: 0,
		})

		salesforce_load(bot as unknown as LoadBotApi)

		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow1)
		expect(bot.addRecord).toHaveBeenCalledTimes(1)
		expect(bot.setHasMoreRecords).toHaveBeenCalledTimes(1)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url:
				baseUrl +
				"/services/data/v59.0/query/?q=SELECT%20Name%2C%20Type%2C%20Id%20FROM%20Account%20WHERE%20((Type%20%3D%20'Customer%20-%20Channel'))%20LIMIT%202",
		})
	})
	it("should load reference fields", () => {
		const bot = mockBot([sfRow3], {
			fields: [
				{
					id: "luigi/foo.name",
				},
				{
					id: "luigi/foo.type",
				},
				{
					id: "luigi/foo.parent",
					fields: [
						{
							id: "luigi/foo.name",
						},
						{
							id: "uesio/core.id",
						},
					],
				},
				{
					id: "uesio/core.id",
				},
			],
			conditions: [
				{
					field: "luigi/foo.parent",
					operator: "IS_NOT_BLANK",
				},
			],
			batchSize: 1,
			batchNumber: 0,
		})

		salesforce_load(bot as unknown as LoadBotApi)

		expect(bot.addRecord).toHaveBeenCalledWith(uesioRow3)
		expect(bot.addRecord).toHaveBeenCalledTimes(1)
		expect(bot.http.request).toHaveBeenCalledWith({
			method: "GET",
			url:
				baseUrl +
				"/services/data/v59.0/query/?q=SELECT%20Name%2C%20Type%2C%20Id%20FROM%20Account%20WHERE%20((Type%20%3D%20'Customer%20-%20Channel'))%20LIMIT%202",
		})
	})
})

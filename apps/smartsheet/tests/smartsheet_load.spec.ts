import { LoadBotApi } from "@uesio/bots"
import smartsheet_load from "../bundle/bots/load/smartsheet_load/bot"

describe("Smartsheet Load", () => {
	it("should load data from Smartsheet", () => {
		const addResult = jest.fn()
		const bot = {
			loadRequest: {
				collectionMetadata: {
					externalName: "somesheetid"
				}
			},
			addResult,
			addError: jest.fn(),
			http: {
				request: jest.fn(() => ({
					code: 200,
					body: {
						rows: [
							{
								id: 1,
								cells: [
									{
										columnId: 1,
										displayValue: "Test",
										value: "Test"
									}
								]
							}
						]
					}
				}))
			}
		}

		smartsheet_load(bot as unknown as LoadBotApi)

		expect(bot.addResult).toHaveBeenCalledWith("rows", [
			{
				id: 1,
				cells: [
					{
						columnId: 1,
						displayValue: "Test",
						value: "Test"
					}
				]
			}
		])
	})
})

import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/checkout"

// type OrderDetails = {
// 	orderNumber: string
// }

export default function checkout(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { successURL, items, mode } = params
	const actionName = bot.getActionName()

	if (actionName !== "checkout") {
		bot.addError("unsupported action name: " + actionName)
		return
	}

	const { apikey } = bot.getCredentials()

	if (apikey === "") {
		bot.addError("missing api key")
		return
	}

	const baseURL = bot.getIntegration().getBaseURL()

	bot.log.info("ITEMS", items)
	bot.log.info("apikey", apikey)
	bot.log.info("baseURL", baseURL)
	bot.log.info("mode", mode)
	bot.log.info("successURL", successURL)

	const result = bot.http.request({
		method: "POST",
		headers: {
			Authorization: `Bearer ${apikey}`,
		},
		url: baseURL + "/v1/checkout/sessions",
		body: {
			mode,
			success_url: successURL,
		},
	})
	// if (result.code !== 200) {
	// 	bot.addError("could not complete checkout: " + result.status)
	// 	return
	// }

	bot.log.info("Result", result)
	bot.log.info("Body", result.body)

	// const orderDetails = result.body as OrderDetails
	// const { orderNumber } = orderDetails

	// bot.addResult("orderNumber", orderNumber)
}

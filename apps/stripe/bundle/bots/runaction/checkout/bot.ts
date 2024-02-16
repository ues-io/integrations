import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/checkout"
import { Stripe } from "stripe"

export default function checkout(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { successURL, items, mode } = params
	const actionName = bot.getActionName()

	if (actionName !== "checkout") {
		bot.addError("unsupported action name: " + actionName)
		return
	}

	const baseURL = bot.getIntegration().getBaseURL()

	const result = bot.http.request({
		method: "POST",
		url: baseURL + "/v1/checkout/sessions",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: {
			mode,
			success_url: successURL,
			items,
		},
	})
	if (result.code !== 200) {
		bot.addError("could not complete checkout: " + result.status)
		return
	}

	const session = result.body as unknown as Stripe.Checkout.Session

	bot.addResult("session", session.url)
}

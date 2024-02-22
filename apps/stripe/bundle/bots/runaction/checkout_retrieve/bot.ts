import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/checkout_retrieve"
import { Stripe } from "stripe"

export default function checkout_retrieve(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { id } = params
	const actionName = bot.getActionName()

	if (actionName !== "checkout_retrieve") {
		bot.addError("unsupported action name: " + actionName)
		return
	}

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<null, Stripe.Checkout.Session>({
		method: "GET",
		url: baseURL + `/v1/checkout/sessions/${id}`,
	})

	if (result.code !== 200) {
		bot.addError("could not complete checkout retrieve: " + result.code)
		return
	}

	bot.addResult("session", result.body)
}

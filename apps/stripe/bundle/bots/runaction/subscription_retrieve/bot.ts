import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/subscription_retrieve"
import { Stripe } from "stripe"

export default function subscription_retrieve(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { id } = params
	const actionName = bot.getActionName()

	if (actionName !== "subscription_retrieve") {
		bot.addError("unsupported action name: " + actionName)
		return
	}

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<null, Stripe.Subscription>({
		method: "GET",
		url: baseURL + `/v1/subscriptions/${id}`,
	})

	if (result.code !== 200) {
		bot.addError("could not complete subscription retrieve: " + result.code)
		return
	}

	bot.addResult("subscription", result.body)
}

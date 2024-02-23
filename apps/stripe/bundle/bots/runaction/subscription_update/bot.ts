import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/subscription_update"
import { Stripe } from "stripe"

export default function subscription_update(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { id, items } = params

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<
		Stripe.SubscriptionUpdateParams,
		Stripe.Subscription
	>({
		method: "POST",
		url: baseURL + `/v1/subscriptions/${id}`,
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: {
			items,
		},
	})

	if (result.code !== 200) {
		bot.addError("could not complete subscription update: " + result.code)
		return
	}

	bot.addResult("subscription", result.body)
}

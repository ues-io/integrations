import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/subscription_list"
import { Stripe } from "stripe"

export default function subscription_retrieve(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { customer } = params

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<
		Stripe.SubscriptionListParams,
		Stripe.Subscription
	>({
		method: "GET",
		url: baseURL + `/v1/subscriptions`,
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: {
			customer: customer as string,
		},
	})

	if (result.code !== 200) {
		bot.addError("could not complete subscription list: " + result.code)
		return
	}

	bot.addResult("subscriptions", result.body)
}

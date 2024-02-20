import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/customer_create"
import { Stripe } from "stripe"

export default function customer_create(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { name, email, metadata } = params
	const actionName = bot.getActionName()

	if (actionName !== "customer_create") {
		bot.addError("unsupported action name: " + actionName)
		return
	}

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<
		Stripe.CustomerCreateParams,
		Stripe.Customer
	>({
		method: "POST",
		url: baseURL + "/v1/customers",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: {
			name,
			email,
			metadata,
		},
	})

	if (result.code !== 200) {
		bot.addError("could not complete customer creation: " + result.code)
		return
	}

	bot.addResult("customer", result.body)
}

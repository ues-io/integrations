import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/paymentintent_create"
import { Stripe } from "stripe"

export default function paymentintent_create(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const { amount, currency, customer, paymentMethod } = params
	const actionName = bot.getActionName()

	if (actionName !== "paymentintent_create") {
		bot.addError("unsupported action name: " + actionName)
		return
	}

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<
		Stripe.PaymentIntentCreateParams,
		Stripe.PaymentIntent
	>({
		method: "POST",
		url: baseURL + "/v1/payment_intents",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: {
			amount,
			currency,
			payment_method: paymentMethod,
			customer,
		},
	})

	if (result.code !== 200) {
		bot.addError(
			"could not complete payment intent creation: " + result.code
		)
		return
	}

	bot.addResult("payment_intent", result.body)
}

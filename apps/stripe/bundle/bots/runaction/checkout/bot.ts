import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/checkout"
import { Stripe } from "stripe"

export default function checkout(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const { currency, customer, success_url, cancel_url } = params
	const mode = params.mode as Stripe.Checkout.SessionCreateParams.Mode
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const line_items = params.line_items as
		| Stripe.Checkout.SessionCreateParams.LineItem[]
		| undefined

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<
		Stripe.Checkout.SessionCreateParams,
		Stripe.Checkout.Session
	>({
		method: "POST",
		url: baseURL + "/v1/checkout/sessions",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: {
			mode,
			currency,
			customer,
			cancel_url,
			success_url,
			line_items,
		},
	})

	if (result.code !== 200) {
		bot.addError("could not complete checkout: " + result.body)
		return
	}

	bot.addResult("session", result.body)
}

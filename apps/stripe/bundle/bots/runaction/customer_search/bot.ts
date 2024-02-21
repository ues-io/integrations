import { RunActionBotApi } from "@uesio/bots"
import { Params } from "@uesio/app/bots/runaction/uesio/stripe/customer_search"
import { Stripe } from "stripe"

export default function customer_search(bot: RunActionBotApi) {
	const params = bot.params.getAll() as Params
	const actionName = bot.getActionName()

	if (actionName !== "customer_search") {
		bot.addError("unsupported action name: " + actionName)
		return
	}

	const buildQueryString = (params: Params) => {
		let query = ""
		if (params.name) {
			query += `name:"${params.name}"`
		}
		if (params.email) {
			query += query ? " AND " : ""
			query += `email:"${params.email}"`
		}
		if (params.uniquekey) {
			query += query ? " AND " : ""
			query += `metadata['uesio/core.uniquekey']:'${params.uniquekey}'`
		}
		return query
	}

	const query = buildQueryString(params)
	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<
		Stripe.CustomerSearchParams,
		Stripe.Customer
	>({
		method: "GET",
		url: baseURL + `/v1/customers/search?query=${query}`,
	})

	if (result.code !== 200) {
		bot.addError("could not complete customer search: " + result.code)
		return
	}

	bot.addResult("customer", result.body)
}

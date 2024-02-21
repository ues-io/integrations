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

		// Check for "name" param and escape single quotes as necessary
		if (params.name) {
			query += `name:${encodeURIComponent(
				params.name.replace(/\\'/g, "'")
			)}`
		}

		// Check for "email" param
		if (params.email) {
			query += query ? " AND " : "" // Add 'AND' only if previous condition was met
			query += `email:${encodeURIComponent(params.email)}`
		}

		// Check for "metadata" param and handle object structure for flexibility
		// if (params.metadata) {
		// 	query += query ? " AND " : "" // Add 'AND' only if previous conditions were met
		// 	query += "metadata["

		// 	// Handle various "metadata" structures:
		// 	if (typeof params.metadata === "object") {
		// 		for (const key in params.metadata) {
		// 			if (params.metadata[key]) {
		// 				query += `'${key}':${encodeURIComponent(
		// 					params.metadata[key]
		// 				)},`
		// 			}
		// 		}
		// 		// Remove trailing comma from object query part
		// 		query = query.slice(0, -1)
		// 	} else {
		// 		// Handle unexpected "metadata" types for robustness
		// 		console.warn('Invalid "metadata" parameter. Ignoring.')
		// 	}

		// 	query += "]"
		// }
		return query
	}

	const query = buildQueryString(params)

	const baseURL = bot.getIntegration().getBaseURL()
	const result = bot.http.request<
		Stripe.CustomerSearchParams,
		Stripe.Customer
	>({
		method: "POST",
		url: baseURL + "v1/customers/search",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: {
			query,
		},
	})

	if (result.code !== 200) {
		bot.addError("could not complete customer search: " + result.code)
		return
	}

	bot.addResult("customer", result.body)
}

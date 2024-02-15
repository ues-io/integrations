import { ListenerBotApi } from "@uesio/bots"

export default function checkout(bot: ListenerBotApi) {
	const url = `https://api.stripe.com/v1/products`

	bot.log.info("URL", url)

	const response = bot.http.request({
		method: "GET",
		url,
		headers: {
			Authorization:
				"Bearer sk_test_51MwQbcF1X3pAO31UFqkNAdVubAAspfKpzZnLLzKiebZGkDVzDQCQ6hTozBBSG7z1zB5NOws9MAsdSZ9Xu39dmoyd00ZVpjccKy",
		},
	})

	bot.log.info("Response", response)
}


declare module "@uesio/app/selectlists/uesio/stripe" {
	export type Mode = "payment" | "setup" | "subscription"
}
declare module "@uesio/app/bots/runaction/uesio/stripe/checkout" {

	type Params = {
		successURL: string
		items: {price: string, quantity: number}[]
		mode: string
	}

	export type {
		Params
	}
}
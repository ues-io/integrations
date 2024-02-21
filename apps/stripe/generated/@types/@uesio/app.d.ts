
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
declare module "@uesio/app/bots/runaction/uesio/stripe/customer_create" {

	type Params = {
		name: string
		email: string
		metadata: unknown
	}

	export type {
		Params
	}
}
declare module "@uesio/app/bots/runaction/uesio/stripe/customer_search" {

	type Params = {
		name?: string
		email?: string
		uniquekey?: string
	}

	export type {
		Params
	}
}
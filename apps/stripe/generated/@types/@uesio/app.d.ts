
declare module "@uesio/app/selectlists/uesio/stripe" {
	export type Mode = "payment" | "setup" | "subscription"
}
declare module "@uesio/app/bots/runaction/uesio/stripe/checkout" {

	type Params = {
		mode: string
		currency?: string
		customer?: string
		success_url?: string
		cancel_url?: string
		line_items?: unknown
	}

	export type {
		Params
	}
}
declare module "@uesio/app/bots/runaction/uesio/stripe/checkout_retrieve" {

	type Params = {
		id: string
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
		metadata?: unknown
	}

	export type {
		Params
	}
}
declare module "@uesio/app/bots/runaction/uesio/stripe/subscription_retrieve" {

	type Params = {
		id: string
	}

	export type {
		Params
	}
}
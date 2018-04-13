import { ApolloClient } from "apollo-client";
import { createHttpLink } from "apollo-link-http";
import { InMemoryCache } from "apollo-cache-inmemory";
import { setContext } from "apollo-link-context";
import { ApolloLink, split } from "apollo-link";
import { WebSocketLink } from "apollo-link-ws";
import { getMainDefinition } from "apollo-utilities";
import { OperationDefinitionNode } from "graphql";

// tslint:disable-next-line:no-any
const httpLink: any = createHttpLink({ uri: "http://10.45.1.11:8080/graphql" });

const authLink = setContext(() => ({
	headers: {
		"x-token": localStorage.getItem("token"),
		"x-refresh-token": localStorage.getItem("refreshToken")
	}
}));

const afterwareLink = new ApolloLink((operation, forward) => {
	const { headers } = operation.getContext();
	if (headers) {
		const token = headers.get("x-token");
		const refreshToken = headers.get("x-refresh-token");
		if (token) {
			localStorage.setItem("token", token);
		}
		if (refreshToken) {
			localStorage.setItem("refreshToken", refreshToken);
		}
	}
	if (forward) {
		return forward(operation);
	} else {
		return null;
	}
});

const httpLinkWithMiddleware = afterwareLink.concat(authLink.concat(httpLink));

const wsLink = new WebSocketLink({
	uri: "ws://10.45.1.11:8080/subscriptions",
	options: {
		reconnect: true,
		connectionParams: {
			token: localStorage.getItem("token"),
			refreshToken: localStorage.getItem("refreshToken")
		}
	}
});

const link = split(
	({ query }) => {
		const { kind, operation } = getMainDefinition(
			query
		) as OperationDefinitionNode;
		return kind === "OperationDefinition" && operation === "subscription";
	},
	wsLink,
	httpLinkWithMiddleware
);

export default new ApolloClient({
	link,
	cache: new InMemoryCache()
});
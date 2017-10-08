## Automatic State Management with Redis

Before using Composer, you must provision a Redis instance and
configure the functions shell to use it for compositions. These are
the options:

1. [Compose Redis](https://console.bluemix.net/catalog/services/compose-for-redis/): 256MB of storage and scales with usage (costs apply).
2. [Redis Cloud](https://console.bluemix.net/catalog/services/redis-cloud): offers a free tier with up to 30MB of storage.
3. Deploy your own: reuse an existing instance.

The shell can provision a Redis instance for you. The default is
Compose Redis and we are adding support for other modes.

## Frequently Asked Questions:

*Do I have to manage the Redis instance, or use it explicitly in my compositions?*

The Redis instance is needed to store the state of your computation as the execution unfolds. The data is managed automatically by the Composer runtime and you do not have to read or write data to the Redis instance yourself.

*Is there a cost for using Redis in the IBM Cloud?*

The Compose Redis tiers are all paid tiers. The pricing information is available here https://console.bluemix.net/catalog/services/redis-cloud. The instance of Redis that `fsh app init --auto` provisions will appear in your IBM Cloud bill as a separate billable service.

*I'm an Apache OpenWhisk user, can I use the Redis instance that is part of that deployment?*

Yes. The Redis URL for a standard OpenWhisk deployment is `redis://localhost:6379` for Ubuntu and Docker for Mac deployments. It is `redis://192.168.99.100:6379` for Docker-Machine deployments.
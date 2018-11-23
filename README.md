# CasparCG State Scanner
App that handles OSC data from CasparCG Server, and deliver status as graphQL queries and subscriptions.


Defaults are specified in top of app.js, but should be ok if you run casparcg-state-scanner in your CCG server folder. 
```
// Generics:
const CCG_HOST = "localhost";
const CCG_LOG_PORT = 3250;
const CCG_AMCP_PORT = 5250;
const CCG_DEFAULT_LAYER = 10;
const CCG_NUMBER_OF_LAYERS = 30;
``` 

## Queries:

### channels:
Query channels:
```
query {
  channels {
    layers {
      foreground {
        name
        path
        length
        loop
        paused
      }
      background {
        name
        path
        length
        loop
      }
    }
  }
}
```

Subscription of all layers of channels
```
subscription {
  channels {
    layers {
      foreground {
        name
        path
        length
        loop
        paused
      }
      background {
        name
        path
      }
    }
  }
}

```

### layer(ch: int, l: int):
Returns selected layer of channel
```
{ layer(ch: 1, l: 10) }
```
### Query timeLeft(ch: int, l: int):
Returns countdown of channel, layer, file

```
{ timeLeft(ch: 1, l: 10) }
```

### Subscription timeLeft:
Subscribe to array with timeLeft for all channels, default layer:
```
subscription {
  timeLeft {
    timeLeft
  }
}
```


## Start:
```
yarn build
yarn start
```

### For API calls from other programs use:
```
http://xxx.xxx.xxx.xxx:5254/graphql
```

### If you call it from a browser, you´ll get a Playground where you can test your queries and subscriptions. And see the data Schema

## Build for Linux and Windows:
```
yarn build
yarn build-win
yarn build-linux
```

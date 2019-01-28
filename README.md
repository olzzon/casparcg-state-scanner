# CasparCG State Scanner
App that handles OSC data from CasparCG Server, and deliver status as graphQL queries and subscriptions.
### A Simple React Client example is here:
```
https://github.com/olzzon/casparcg-state-scanner-example
```

Defaults are specified in top of app.js, but should be ok if you run casparcg-state-scanner in your CCG server folder. 
If you wan´t to change default ports and IP you can do that in ./utils/CONSTANTS.js
And manually rebuild.

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

## Subscription of all layers of channels
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

## Subscrition of PlayerLayer:
(default layer 10)

```
subscription {
  playerLayer {
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

### Subscription Media Foler Updated:

Subscribe to a media folder wathcer on the CCG server, so you get a "TRUE" when files are updated or changed.

```
subscription {
  mediaFilesChanged
}
```




## Start:
```
yarn build
yarn start
```

### For API calls from other programs use:
```
http://xxx.xxx.xxx.xxx:5254
```

### If you call it from a browser, you´ll get a Playground where you can test your queries and subscriptions. And see the data Schema

## Build for Linux and Windows:
```
yarn build
yarn build-win
yarn build-linux
```

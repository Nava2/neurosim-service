# API Description

All response errors follow: 

```
Some error message description.
```

## Sessions

### Create session

`POST /session/new` 

#### Headers

* `Content-Type`: `application/json`

#### Body

```json
{
    "start": "2016-04-05T12:02:32.022",
    "userId": "kbright2",
    "model": "brain_3d"
}
```

#### Response 

Good:

```
3fe4cb80-8522-11e6-958b-f38f0e68ccfd
```

`3fe4cb80-8522-11e6-958b-f38f0e68ccfd` is the uuid of the session.

### End session

`POST /session/end/:uuid`

#### Example

`POST /session/end/3fe4cb80-8522-11e6-958b-f38f0e68ccfd`

#### Headers

* `Content-Type`: `application/json`


#### Body

```json
{
	"end": "2016-04-05T13:02:34.022"
}
```

#### Response 

Good:

```
3fe4cb80-8522-11e6-958b-f38f0e68ccfd
```

`3fe4cb80-8522-11e6-958b-f38f0e68ccfd` is the uuid of the session now ended.

## Spatial data

### Add

`POST /spatial/:uuid`

#### Headers

* `Content-Type`: `application/json`

#### Body

```json
{
  "data": [
    {
        "start": "2016-04-05T12:02:32.022",
        "end": "2016-04-05T12:02:32.022",
        "x": 20.0,
        "y": 23.4,
        "zoom": -1.0,
        "alpha": 234.0,
        "beta": 234.0,
        "gamma": 234.0
    },

    {   
        "start": "2016-04-05T12:02:33.022",
        "end": "2016-04-05T12:02:32.022",
        "x": 20.0,
        "y": 23.4,
        "zoom": 32.4,
        "alpha": 234.0,
        "beta": 234.0,
        "gamma": 234.0
    },
    {
        "start": "2016-04-05T12:02:33.022",
        "end": "2016-04-05T12:02:32.022",
        "x": 20.0,
        "y": 23.4,
        "zoom": 3.4,
        "alpha": 234.0,
        "beta": 234.0,
        "gamma": 234.0
    }
  ]
}
```

#### Response

```
3
```

In this example, `3` is the number of rows added.

## Click data

### Add

`POST /click/:uuid`

#### Headers

* `Content-Type`: `application/json`

#### Body

```
{
  "data": [
    {
        "timestamp": "2016-04-05T12:02:33.022",
        "button": "button_id"
    }, {
        "timestamp": "2016-04-05T12:02:40.022",
        "button": "button_id"
    }
  ]
}
```

#### Response

```
2
```

Added `2` rows from the previous call. 

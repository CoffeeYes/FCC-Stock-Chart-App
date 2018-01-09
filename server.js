// server.js
// where your node app starts

// init project
var express = require('express');
var http = require("http");
var app = express();
var webSocket = require("ws");
var pug = require("pug");
var req = require("request");
var mClient = require("mongodb").MongoClient;
var ObjectId = require("mongodb").ObjectID;
var bparser = require("body-parser");

//environment variables
var api_key = process.env.API_KEY;
var mongo_url = process.env.MONGO_URL

//set the view engine to pug templating language
app.set("view engine","pug");

//server and websocket
var server = http.createServer(app);
const wss = new webSocket.Server({ server });


// parse application/x-www-form-urlencoded
app.use(bparser.urlencoded({ extended: false }))

//------------------------------------ get routes ----------------------------------------------------------------------------

app.get("/",function(request,response) {
  
  response.redirect("/test2")
})

app.get("/test",function(request,response) {
  req("https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=MSFT&interval=5min&apikey=" + api_key,function(error,res,body) {
    if(error)throw error;
    var result = JSON.parse(body)
    
    //array for the last 100 close ticker values
    var last_100_close = []
    
    //finds all the close values of the stock searched in the API
    for(var item in result["Time Series (5min)"]) {
      var test_obj = {
        name: item,
        value: result["Time Series (5min)"][item]['4. close']
      }
      
      last_100_close.push(test_obj)
    }
    
    //console.log(last_100_close)
    
    response.render("index",{value_arr: JSON.stringify(last_100_close)})
  })
})

app.get("/test2",function(request,response) {
  
  var final_arr = [];
  
  //promise to retrieve ticker names from database
  var get_ticker = new Promise(function(resolve,reject) {
      mClient.connect(mongo_url,function(error,database) {
      if(error)throw error;
      database.collection("tickers").find({}).toArray(function(error,data) {
        if(error)throw error;
        var ticker_arr = data[0].tickers;

        for(var item in ticker_arr) {

          var cur_ticker = ticker_arr[item];
          final_arr.push([cur_ticker]);
        }
        if(final_arr.length == ticker_arr.length) {
            resolve(final_arr)
          }
        else {
            reject(Error("it broke"))
        }
      })

    })
    
  })
  
  function get_api_data(ticker) {
    var result_array = [];
    result_array[0] = ticker;
    
    return new Promise(function (resolve,reject) {
      req("https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&interval=5min&apikey=" + api_key + "&symbol=" + ticker,function(error,res,body) {
        if(error)throw error;
        
        var result = JSON.parse(body
                               )
        for(var item in result["Time Series (5min)"]) {
          var test_obj = {
            name: item,
            value: result["Time Series (5min)"][item]['4. close']
          }

          result_array.push(test_obj)
          
          if(result_array.length == 101) {
            resolve(result_array)
          }
          
        }
      })
      
    })
  }
  
  
  //async task chain
  var test_arr = []
  get_ticker.then(function(result) {
    for(var i = 0; i < result.length;i++) {
      get_api_data(result[i][0]).then(function(test){
        test_arr.push(test)
      }).then(function(){
        //once all api calls have finished push the data to frontend google charts
        Promise.all(test_arr).then(function(){
          if(test_arr.length == result.length) {
          response.render("test2",{value_arr: JSON.stringify(test_arr),ticker_arr: result})
          }
        })
      })
    }
    
  },function(err) {
    console.log(err)
  })
  
});
//------------------------------------------------------------------------------------------------------------------------------



//---------------------------------post routes ---------------------------------------------------------------------------------

  //push the new ticker to the database 
app.post("/add-ticker",function(request,response) {
  var ticker = request.body["search-term"]
  
  // if the field is empty return an error
  if(ticker.trim() == "") {
    return response.render("index",{error: "Field cannot be empty"})
  }
  
  else {
    req("https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&interval=5min&apikey=" + api_key + "&symbol=" + ticker,function(error,res,body) {
      var result = JSON.parse(body)
      //if the api call for given ticker responds with an error, throw an "invalid ticker" error to user
      if(result["Error Message"]) {
        return response.render("index",{error: "Invalid Ticker"})
      }
      //else push ticker to database
      else {
        mClient.connect(mongo_url,function(error,database) {
          if(error)throw error;
          database.collection("tickers").update({_id: ObjectId("5a37929df36d2869668c23b5")},{$push: {tickers: ticker}})
          response.redirect("/")
        })
      }
    })
  }
  
  
})

app.post("/delete-ticker",function(request,response) {
  var ticker_to_remove = request.body.clicked
  mClient.connect(mongo_url,function(error,database){
    if(error)throw error;
    database.collection("tickers").update({_id: ObjectId("5a37929df36d2869668c23b5")},{$pull: {tickers : ticker_to_remove}})
    response.redirect("/test2")
  })
})
//------------------------------------------------------------------------------------------------------------------------------

//------------------------------------------------- sockets -----------------------------------------------------------------------------
wss.on('connection', function connection(ws, req) {
  
  console.log(wss.clients.size + " connected")
  
  ws.send("test_message")
  
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
    if(message == "clicked") {
      for(var client in wss.clients) {
        client.send("__refresh")
      }
    }
  });
  
  ws.on('close',function() {
    console.log("client disconnected - " + wss.clients.size + " connected")
  });
  
  
});
//---------------------------------------------------------------------------------------------------------------------------------------
// listen for requests :)
server.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + process.env.PORT);
});
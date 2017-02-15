/**
 * Created by kevin on 13/10/2016.
 */

$(function () {

  var $btn = $('#backBtn');

  $btn.click(function () {
    window.location.href = "/";
  });

  var $canvas = $("#canvas");

  console.log("w=", $canvas.width(), "h=", $canvas.height());

});

/**
 * Created by kevin on 13/10/2016.
 */

$(function () {

  var $btn = $('#backBtn');

  $btn.click(function () {
    window.location.href = "/";
  });

  var $canvas = $("#canvas");
  var ctx = $canvas[0].getContext('2d');
  ctx.font = "48px Helvetica";
  ctx.fillText("Downloading simulation...", $canvas.width()/2. - 225, $canvas.height()/2. - 24);

  console.log("w=", $canvas.width(), "h=", $canvas.height());

});

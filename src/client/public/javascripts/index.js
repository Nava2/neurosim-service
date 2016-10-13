/**
 * Created by kevin on 13/10/2016.
 */

$(function () {

  var $btn3d = $('#btn-3d');

  $btn3d.click(function () {
    window.location.href = "/3d";
  });

  var $btn2d = $('#btn-2d');
  $btn2d.click(function () {
    window.location.href = "/2d";
  });
});
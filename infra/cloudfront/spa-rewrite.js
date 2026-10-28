// CloudFront Function (cloudfront-js-2.0), viewer-request on the DEFAULT (S3)
// behavior of distribution E37V7OK25PWZRX. SPA routes such as /login or
// /meetings/<id>/ have no file extension and are served /index.html; real
// files (/assets/*.js) pass through. /api/* is a separate behavior and never
// reaches this function, so API status codes (404, 401) stay intact.
function handler(event) {
  var request = event.request;
  var last = request.uri.split("/").pop();
  if (last.indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}

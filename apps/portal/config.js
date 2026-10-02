(function () {
  if (window.WBS_API_BASE_URL) return;
  var h = window.location.hostname;
  if (h.includes("azurecontainerapps.io")) {
    window.WBS_API_BASE_URL = "https://" + h.replace("wbs-portal", "wbs-api");
  } else {
    window.WBS_API_BASE_URL = "http://localhost:8000";
  }
})();

/**
 * Ruiru Titans FC - Automated Google Form & Connected Google Sheet Setup Script
 *
 * HOW TO USE:
 * 1. Open https://script.google.com/
 * 2. Click "New Project".
 * 3. Delete any default code, paste this entire file, and click "Save".
 * 4. Select the function "createTitansPlayerFormAndSheet" and click "Run".
 * 5. Review permissions when prompted by Google.
 * 6. The Execution Log will display:
 *    - The live public Google Form URL (to share with players)
 *    - The Google Form Edit URL
 *    - The connected Google Sheet URL (where responses are stored with dropdowns)
 *    - The direct CSV export link ready to paste into Ruiru Titans Team Balancer!
 */

function createTitansPlayerFormAndSheet() {
  var formTitle = "Ruiru Titans FC — Player Registration & Skill Assessment";
  var formDescription = "Official player registration form for Ruiru Titans FC tournaments and competitions. Please submit your name, tactical playing position, and skill category.";

  // 1. Create the Google Form
  var form = FormApp.create(formTitle);
  form.setDescription(formDescription);
  form.setAllowResponseEdits(false);
  form.setProgressBar(true);
  form.setLimitOneResponsePerUser(false);

  // Field 1: Player Name (Text)
  var nameItem = form.addTextItem();
  nameItem.setTitle("Player Name");
  nameItem.setHelpText("Enter the player's full name (e.g. Patrick Kamau)");
  nameItem.setRequired(true);

  // Field 2: Position (Dropdown)
  var posItem = form.addListItem();
  posItem.setTitle("Position");
  posItem.setHelpText("Select your primary on-pitch playing position");
  posItem.setRequired(true);
  posItem.setChoiceValues([
    "GK — Goalkeeper",
    "LB — Left Back",
    "CB — Center Back",
    "RB — Right Back",
    "CDM — Defensive Midfielder",
    "CM — Central Midfielder",
    "LW — Left Winger",
    "RW — Right Winger",
    "ST — Striker / Center Forward"
  ]);

  // Field 3: Category / Skill Tier (Dropdown)
  var catItem = form.addListItem();
  catItem.setTitle("Category");
  catItem.setHelpText("Select skill class (A = Elite down to E = Novice)");
  catItem.setRequired(true);
  catItem.setChoiceValues([
    "A — Elite / Pro Level",
    "B — Advanced / Strong Club",
    "C — Intermediate / Regular",
    "D — Amateur / Developing",
    "E — Recreational / Novice"
  ]);

  // 2. Create the connected Google Spreadsheet
  var sheetTitle = "Ruiru Titans FC — Player Database & Responses";
  var ss = SpreadsheetApp.create(sheetTitle);
  var sheet = ss.getActiveSheet();
  sheet.setName("Players");

  // Setup headers with data validation dropdowns in the Sheet
  var headers = ["Timestamp", "Player Name", "Position", "Category"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#0B3A2E")
    .setFontColor("#C9A227")
    .setFontWeight("bold")
    .setFontSize(11);
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 170); // Timestamp
  sheet.setColumnWidth(2, 220); // Player Name
  sheet.setColumnWidth(3, 160); // Position
  sheet.setColumnWidth(4, 180); // Category

  // Add Data Validation dropdowns to Sheet columns for manual entry
  var posRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["GK", "LB", "CB", "RB", "CDM", "CM", "LW", "RW", "ST"], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange("C2:C500").setDataValidation(posRule);

  var catRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["A", "B", "C", "D", "E"], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange("D2:D500").setDataValidation(catRule);

  // 3. Connect Google Form to send responses directly to this Google Sheet
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 4. Log all links for the user
  var publishedFormUrl = form.getPublishedUrl();
  var editFormUrl = form.getEditUrl();
  var sheetUrl = ss.getUrl();
  var sheetCsvExportUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=csv&gid=0";

  Logger.log("==================================================================");
  Logger.log("✅ RUIRU TITANS GOOGLE FORM & GOOGLE SHEET CREATED SUCCESSFULLY!");
  Logger.log("==================================================================");
  Logger.log("1. Public Google Form Link (share with players):");
  Logger.log(publishedFormUrl);
  Logger.log("\n2. Google Form Edit Link (admin configuration):");
  Logger.log(editFormUrl);
  Logger.log("\n3. Connected Google Sheet URL (view responses):");
  Logger.log(sheetUrl);
  Logger.log("\n4. Direct Google Sheet CSV Link (paste into Ruiru Titans Team Balancer):");
  Logger.log(sheetCsvExportUrl);
  Logger.log("==================================================================");

  return {
    formId: form.getId(),
    formPublicUrl: publishedFormUrl,
    formEditUrl: editFormUrl,
    sheetId: ss.getId(),
    sheetUrl: sheetUrl,
    sheetCsvExportUrl: sheetCsvExportUrl
  };
}

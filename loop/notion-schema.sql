-- Notion "Post Queue" database (created with Notion MCP create-database)
CREATE TABLE (
  "Draft" TITLE,
  "Channel" SELECT('threads':purple, 'x':gray, 'linkedin':blue),
  "Type" SELECT('post':green, 'reply':yellow),
  "Angle" SELECT('A':orange, 'B':pink, 'C':blue),
  "Text" RICH_TEXT,
  "Reply to URL" URL,
  "Tagged link" URL,
  "Day" NUMBER,
  "Approved" CHECKBOX,
  "Status" STATUS('Drafted':gray:to_do, 'Blocked':red:to_do, 'Posted':green:complete, 'Failed':orange:complete),
  "Gate notes" RICH_TEXT,
  "Posted URL" URL,
  "Views" NUMBER,
  "Visitors" NUMBER,
  "Created" CREATED_TIME
)

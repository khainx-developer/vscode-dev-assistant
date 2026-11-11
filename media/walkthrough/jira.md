# Connect Jira (optional)

1. Enter your site URL, e.g. `https://your-company.atlassian.net`, and choose **Connect Jira**.
2. Approve access in the Atlassian page that opens in your browser.
3. Type **your name exactly as it appears in the Assignee field**, then add a JQL query such as:

```
assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC
```

Tickets that are overdue, due soon, in review, or have new comments now show up in your Attention Inbox — grouped with their pull requests.

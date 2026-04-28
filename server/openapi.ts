export const openApiSpec = {
  "openapi": "3.0.0",
  "info": {
    "title": "Personal Finance Tracker API",
    "version": "1.0.0",
    "description": "API documentation. Use /api/auth/sign-in/email to login via the UI to set your session cookie, then test other endpoints!"
  },
  "servers": [
    {
      "url": "/",
      "description": "Relative (Current Endpoint)"
    }
  ],
  "components": {
    "securitySchemes": {
      "cookieAuth": {
        "type": "apiKey",
        "in": "cookie",
        "name": "better-auth.session_token"
      }
    }
  },
  "security": [
    {
      "cookieAuth": []
    }
  ],
  "paths": {
    "/api/auth/sign-up/email": {
      "post": {
        "tags": ["Authentication"],
        "summary": "Register a new user",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "email": { "type": "string", "example": "test@example.com" },
                  "password": { "type": "string", "example": "password123!" },
                  "name": { "type": "string", "example": "John Doe" }
                },
                "required": ["email", "password", "name"]
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Success" }
        }
      }
    },
    "/api/auth/sign-in/email": {
      "post": {
        "tags": ["Authentication"],
        "summary": "Login via Email",
        "description": "This will set a session cookie in your browser.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "email": { "type": "string", "example": "test@example.com" },
                  "password": { "type": "string", "example": "password123!" }
                },
                "required": ["email", "password"]
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Success, cookie set!" }
        }
      }
    },
    "/api/auth/sign-out": {
      "post": {
        "tags": ["Authentication"],
        "summary": "Sign out securely",
        "responses": {
          "200": { "description": "Success" }
        }
      }
    },
    "/api/transactions": {
      "get": {
        "tags": ["Transactions"],
        "summary": "Get all transactions for user",
        "responses": {
          "200": {
            "description": "List of transactions",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "items": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": { "type": "string" },
                          "amount": { "type": "string" },
                          "type": { "type": "string" },
                          "categoryId": { "type": "string" },
                          "description": { "type": "string" },
                          "date": { "type": "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized access"
          }
        }
      },
      "post": {
        "tags": ["Transactions"],
        "summary": "Create a new transaction",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "amount": { "type": "number", "example": 500 },
                  "type": { "type": "string", "enum": ["income", "expense"], "example": "income" },
                  "categoryId": { "type": "string", "example": "uuid" },
                  "date": { "type": "string", "example": "2024-01-01" },
                  "description": { "type": "string", "example": "Salary" }
                },
                "required": ["amount", "type", "date"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string" },
                    "amount": { "type": "string" },
                    "type": { "type": "string" }
                  }
                }
              }
            }
          },
          "400": { "description": "Validation failure" }
        }
      }
    },
    "/api/budgets": {
      "get": {
        "tags": ["Budgets"],
        "summary": "Get all budgets",
        "responses": {
          "200": {
            "description": "List of budgets",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "items": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": { "type": "string" },
                          "limitAmount": { "type": "string" },
                          "month": { "type": "string" },
                          "spent": { "type": "string" },
                          "remaining": { "type": "string" },
                          "percentageUsed": { "type": "number" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/categories": {
      "get": {
        "tags": ["Categories"],
        "summary": "Get all categories",
        "responses": {
          "200": {
            "description": "List of categories",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "items": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": { "type": "string" },
                          "label": { "type": "string" },
                          "color": { "type": "string" },
                          "icon": { "type": "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/reports/summary": {
      "get": {
        "tags": ["Reports"],
        "summary": "Get financial summary",
        "responses": {
          "200": { "description": "Summary report" }
        }
      }
    },
    "/api/notifications": {
      "get": {
        "tags": ["Notifications"],
        "summary": "Get dynamic notifications",
        "responses": {
          "200": { "description": "List of dynamic alerts" }
        }
      }
    },
    "/api/notifications/mark-all-read": {
      "post": {
        "tags": ["Notifications"],
        "summary": "Mark all alerts as read",
        "responses": {
          "200": { "description": "Success state" }
        }
      }
    },
    "/api/notifications/{id}/read": {
      "put": {
        "tags": ["Notifications"],
        "summary": "Mark individual alert as read",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": { "description": "Success state" }
        }
      }
    }
  }
};

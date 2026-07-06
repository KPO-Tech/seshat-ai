package resources

type Organization struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	OwnerUserID string `json:"owner_user_id"`
	Status      string `json:"status"`
}

type Workspace struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Status         string `json:"status"`
}

type CreateUserParams struct {
	Email       string
	DisplayName string
	Password    string
	Status      string
	Roles       []string
}

type UpdateUserParams struct {
	DisplayName *string
	Password    *string
	Status      *string
}

type CreateOrganizationParams struct {
	Name string
	Slug string
}

type UpdateOrganizationParams struct {
	Name   *string
	Slug   *string
	Status *string
}

type CreateWorkspaceParams struct {
	OrganizationID string
	Name           string
	Slug           string
}

type UpdateWorkspaceParams struct {
	OrganizationID *string
	Name           *string
	Slug           *string
	Status         *string
}

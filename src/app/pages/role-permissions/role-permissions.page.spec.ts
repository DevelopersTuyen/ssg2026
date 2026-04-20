import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RolePermissionsPage } from './role-permissions.page';

describe('RolePermissionsPage', () => {
  let component: RolePermissionsPage;
  let fixture: ComponentFixture<RolePermissionsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RolePermissionsPage],
      imports: [IonicModule.forRoot(), FormsModule, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(RolePermissionsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

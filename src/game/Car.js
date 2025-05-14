import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class Car {
  constructor(scene, gameState) {
    this.scene = scene;
    this.gameState = gameState;
    this.car = null;
    this.headlight1 = null;
    this.headlight2 = null;

    // 디버깅을 위한 로그
    console.log("Car 클래스 생성됨");
  }

  async loadModel() {
    return new Promise((resolve) => {
      console.log("차량 모델 로딩 시작...");

      // 간단한 자동차 모델 생성
      const carGeometry = new THREE.BoxGeometry(4, 2, 8);
      const carMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      this.car = new THREE.Mesh(carGeometry, carMaterial);

      // 초기 위치 설정 - 더 높게 설정하여 지면 위에 올려놓음
      this.car.position.set(
        this.gameState.car.position.x,
        this.gameState.car.position.y + 2, // 바닥에서 약간 위로
        this.gameState.car.position.z
      );

      this.car.castShadow = true;
      this.scene.add(this.car);

      console.log("차량이 씬에 추가됨:", this.car.position);

      // 자동차 앞부분 표시
      const carFrontGeometry = new THREE.BoxGeometry(3, 1, 1);
      const carFrontMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
      });
      const carFront = new THREE.Mesh(carFrontGeometry, carFrontMaterial);
      carFront.position.z = 3.5;
      this.car.add(carFront);

      // 자동차 바퀴 생성
      const wheelGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 16);
      const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

      // 앞 왼쪽 바퀴
      const frontLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      frontLeftWheel.position.set(2, -1, 2);
      frontLeftWheel.rotation.z = Math.PI / 2;
      this.car.add(frontLeftWheel);

      // 앞 오른쪽 바퀴
      const frontRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      frontRightWheel.position.set(-2, -1, 2);
      frontRightWheel.rotation.z = Math.PI / 2;
      this.car.add(frontRightWheel);

      // 뒤 왼쪽 바퀴
      const rearLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      rearLeftWheel.position.set(2, -1, -2);
      rearLeftWheel.rotation.z = Math.PI / 2;
      this.car.add(rearLeftWheel);

      // 뒤 오른쪽 바퀴
      const rearRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      rearRightWheel.position.set(-2, -1, -2);
      rearRightWheel.rotation.z = Math.PI / 2;
      this.car.add(rearRightWheel);

      // 헤드라이트 추가
      this.headlight1 = new THREE.SpotLight(0xffffff, 2);
      this.headlight1.position.set(1, 1, 3);
      this.headlight1.angle = Math.PI / 6;
      this.headlight1.penumbra = 0.1;
      this.headlight1.decay = 2;
      this.headlight1.distance = 30;
      this.headlight1.castShadow = true;
      this.car.add(this.headlight1);

      this.headlight2 = new THREE.SpotLight(0xffffff, 2);
      this.headlight2.position.set(-1, 1, 3);
      this.headlight2.angle = Math.PI / 6;
      this.headlight2.penumbra = 0.1;
      this.headlight2.decay = 2;
      this.headlight2.distance = 30;
      this.headlight2.castShadow = true;
      this.car.add(this.headlight2);

      // 게임 상태의 차량 위치를 업데이트
      this.gameState.car.position.y = 2;

      console.log("차량 모델 로딩 완료");
      resolve();
    });
  }

  update(deltaTime) {
    // 가속/감속 처리
    const accelerationFactor = 20;
    const brakingFactor = 40;
    const dragFactor = 5;

    if (!this.gameState.controls) {
      console.warn(
        "Controls object is missing. Initializing default controls."
      );
      this.gameState.controls = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
        horn: false,
        camera: false,
      };
    }

    if (this.gameState.controls.forward) {
      this.gameState.car.acceleration = accelerationFactor;
    } else if (this.gameState.controls.backward) {
      this.gameState.car.acceleration = -accelerationFactor;
    } else {
      this.gameState.car.acceleration = 0;
    }

    if (this.gameState.controls.brake) {
      if (this.gameState.car.speed > 0) {
        this.gameState.car.acceleration -= brakingFactor;
      } else if (this.gameState.car.speed < 0) {
        this.gameState.car.acceleration += brakingFactor;
      }
    }

    // 항력 적용
    if (this.gameState.car.speed > 0) {
      this.gameState.car.acceleration -=
        dragFactor * (this.gameState.car.speed / this.gameState.car.maxSpeed);
    } else if (this.gameState.car.speed < 0) {
      this.gameState.car.acceleration +=
        dragFactor *
        (Math.abs(this.gameState.car.speed) / this.gameState.car.maxSpeed);
    }

    // 속도 업데이트
    this.gameState.car.speed += this.gameState.car.acceleration * deltaTime;

    // 최대 속도 제한
    if (this.gameState.car.speed > this.gameState.car.maxSpeed) {
      this.gameState.car.speed = this.gameState.car.maxSpeed;
    } else if (this.gameState.car.speed < -this.gameState.car.maxSpeed / 2) {
      this.gameState.car.speed = -this.gameState.car.maxSpeed / 2;
    }

    // 회전 처리
    const rotationSpeed = 2.0;
    const speedFactor = Math.abs(this.gameState.car.speed) / 50;

    if (this.gameState.car.speed !== 0) {
      if (this.gameState.controls.left) {
        this.gameState.car.rotation +=
          rotationSpeed *
          speedFactor *
          Math.sign(this.gameState.car.speed) *
          deltaTime;
      }

      if (this.gameState.controls.right) {
        this.gameState.car.rotation -=
          rotationSpeed *
          speedFactor *
          Math.sign(this.gameState.car.speed) *
          deltaTime;
      }
    }

    // 위치 업데이트
    const movementX =
      Math.sin(this.gameState.car.rotation) *
      this.gameState.car.speed *
      deltaTime;
    const movementZ =
      Math.cos(this.gameState.car.rotation) *
      this.gameState.car.speed *
      deltaTime;

    this.gameState.car.position.x += movementX;
    this.gameState.car.position.z += movementZ;

    // 자동차 메시 업데이트
    if (this.car) {
      this.car.position.x = this.gameState.car.position.x;
      this.car.position.z = this.gameState.car.position.z;
      this.car.rotation.y = this.gameState.car.rotation;

      // 디버깅 로그 (커스텀 상태 표시기를 추가하거나 콘솔 로그 활성화)
      if (this.gameState.car.speed > 0.1 || this.gameState.car.speed < -0.1) {
        console.log(
          `차량 위치: (${this.car.position.x.toFixed(
            2
          )}, ${this.car.position.y.toFixed(2)}, ${this.car.position.z.toFixed(
            2
          )}), 속도: ${this.gameState.car.speed.toFixed(2)}`
        );
      }
    }

    // 속도계 업데이트
    const speedometer = document.getElementById("speedometer");
    if (speedometer) {
      speedometer.textContent = `속도: ${Math.abs(
        Math.round(this.gameState.car.speed)
      )} km/h`;
    }

    // 헤드라이트 업데이트
    this.updateHeadlights();

    // 카메라 업데이트 - Controls.js로 이동됨
    if (this.gameState.controls.updateCameraPosition) {
      // Controls 클래스에 updateCameraPosition 메서드가 있으면 호출
      this.gameState.controls.updateCameraPosition();
    } else {
      // 이전 방식의 카메라 업데이트 유지
      this.updateCamera();
    }

    // 충돌 감지
    this.checkCollisions();
  }

  // 헤드라이트 업데이트
  updateHeadlights() {
    // 헤드라이트 방향 업데이트
    if (this.headlight1 && this.headlight2) {
      const targetX =
        this.car.position.x + Math.sin(this.gameState.car.rotation) * 10;
      const targetZ =
        this.car.position.z + Math.cos(this.gameState.car.rotation) * 10;

      if (!this.headlight1.target.parent) {
        this.scene.add(this.headlight1.target);
      }
      if (!this.headlight2.target.parent) {
        this.scene.add(this.headlight2.target);
      }

      this.headlight1.target.position.set(
        targetX,
        this.car.position.y,
        targetZ
      );
      this.headlight2.target.position.set(
        targetX,
        this.car.position.y,
        targetZ
      );
    }
  }

  // 카메라 업데이트 (기존 호환성 유지)
  updateCamera() {
    // 카메라 위치 업데이트
    switch (this.gameState.camera.mode) {
      case "follow":
        // 3인칭 시점 (자동차 뒤에서 따라가는 시점)
        this.gameState.camera.position = {
          x:
            this.gameState.car.position.x -
            Math.sin(this.gameState.car.rotation) * 15,
          y: this.gameState.car.position.y + 7,
          z:
            this.gameState.car.position.z -
            Math.cos(this.gameState.car.rotation) * 15,
        };
        this.gameState.camera.lookAt = {
          x: this.gameState.car.position.x,
          y: this.gameState.car.position.y + 2,
          z: this.gameState.car.position.z,
        };
        break;

      case "first-person":
        // 1인칭 시점 (운전석 시점)
        this.gameState.camera.position = {
          x:
            this.gameState.car.position.x +
            Math.sin(this.gameState.car.rotation) * 2,
          y: this.gameState.car.position.y + 3,
          z:
            this.gameState.car.position.z +
            Math.cos(this.gameState.car.rotation) * 2,
        };
        this.gameState.camera.lookAt = {
          x:
            this.gameState.car.position.x +
            Math.sin(this.gameState.car.rotation) * 10,
          y: this.gameState.car.position.y + 2,
          z:
            this.gameState.car.position.z +
            Math.cos(this.gameState.car.rotation) * 10,
        };
        break;

      case "top-down":
        // 탑다운 시점 (위에서 내려다보는 시점)
        this.gameState.camera.position = {
          x: this.gameState.car.position.x,
          y: this.gameState.car.position.y + 30,
          z: this.gameState.car.position.z,
        };
        this.gameState.camera.lookAt = {
          x: this.gameState.car.position.x,
          y: this.gameState.car.position.y,
          z: this.gameState.car.position.z,
        };
        break;

      case "free":
        // free 모드는 Controls.js에서 처리
        break;
    }
  }

  // 충돌 감지
  checkCollisions() {
    // 건물 충돌 감지
    this.gameState.buildings.forEach((building) => {
      const distance = Math.sqrt(
        Math.pow(this.gameState.car.position.x - building.position.x, 2) +
          Math.pow(this.gameState.car.position.z - building.position.z, 2)
      );

      // 충돌 반경 (자동차 크기 + 건물 크기의 반)
      const collisionRadius = 4 + building.width / 2;

      if (distance < collisionRadius) {
        // 충돌 처리 - 자동차를 건물 반대 방향으로 밀어냄
        const pushDirection = {
          x: this.gameState.car.position.x - building.position.x,
          z: this.gameState.car.position.z - building.position.z,
        };

        // 방향 정규화
        const magnitude = Math.sqrt(
          pushDirection.x * pushDirection.x + pushDirection.z * pushDirection.z
        );
        if (magnitude > 0) {
          pushDirection.x /= magnitude;
          pushDirection.z /= magnitude;
        }

        // 자동차 위치 조정
        this.gameState.car.position.x =
          building.position.x + pushDirection.x * collisionRadius;
        this.gameState.car.position.z =
          building.position.z + pushDirection.z * collisionRadius;

        // 속도 감소
        this.gameState.car.speed *= 0.5;

        console.log("건물과 충돌!");
      }
    });
  }
}

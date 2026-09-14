"""Simulador basico de un motor DC.

Modelo electrico-mecanico:
    V = R*i + L*di/dt + Ke*w
    J*dw/dt = Kt*i - b*w - T_carga
"""


class MotorDC:
    def __init__(
        self,
        resistencia=1.0,
        inductancia=0.5,
        constante_fem=0.01,
        constante_torque=0.01,
        inercia=0.01,
        friccion=0.1,
    ):
        self.R = resistencia
        self.L = inductancia
        self.Ke = constante_fem
        self.Kt = constante_torque
        self.J = inercia
        self.b = friccion
        self.corriente = 0.0
        self.velocidad = 0.0

    def paso(self, voltaje, torque_carga=0.0, dt=0.001):
        """Avanza la simulacion un paso de tiempo usando Euler explicito."""
        di_dt = (voltaje - self.R * self.corriente - self.Ke * self.velocidad) / self.L
        dw_dt = (self.Kt * self.corriente - self.b * self.velocidad - torque_carga) / self.J

        self.corriente += di_dt * dt
        self.velocidad += dw_dt * dt

        return self.corriente, self.velocidad


def simular():
    motor = MotorDC()
    voltaje = 12.0
    dt = 0.001
    tiempo_total = 2.0
    pasos = int(tiempo_total / dt)

    print("Tiempo(s)\tCorriente(A)\tVelocidad(rad/s)")
    for paso in range(pasos + 1):
        tiempo = paso * dt
        corriente, velocidad = motor.paso(voltaje, dt=dt)

        if paso % 100 == 0:
            print(f"{tiempo:.2f}\t\t{corriente:.4f}\t\t{velocidad:.4f}")


if __name__ == "__main__":
    simular()

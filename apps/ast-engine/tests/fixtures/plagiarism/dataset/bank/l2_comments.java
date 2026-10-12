import java.util.ArrayList;
import java.util.List;

public class MoneyBox {
    private final String who;
    private double cash;
    private final List<String> journal = new ArrayList<>();

    public MoneyBox(String who, double start) {
        this.who = who;
        this.cash = start;
        journal.add("OPEN:" + start);
    }

    // nap tien
    public void payIn(double sum) {
        if (sum <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
        cash += sum;
        journal.add("DEPOSIT:" + sum);
    }

    public boolean payOut(double sum) {
        if (sum <= 0 || sum > cash) {
            return false;
        }
        cash -= sum;
        journal.add("WITHDRAW:" + sum);
        return true;
    }

    public boolean sendMoney(MoneyBox dest, double sum) {
        if (payOut(sum)) {
            dest.payIn(sum);
            journal.add("TRANSFER:" + sum + "->" + dest.who);
            return true;
        }
        return false;
    }

    public void grow(double pct, int term) {
        for (int i = 0; i < term; i++) {
            cash = cash + cash * pct / 100;
        }
        journal.add("INTEREST:" + pct);
    }

    /* xem so du */
    public double howMuch() {
        return cash;
    }

    public void dump() {
        System.out.println("Owner: " + who);
        for (String row : journal) {
            System.out.println(" - " + row);
        }
        System.out.println("Balance: " + cash);
    }

    public static void main(String[] args) {
        MoneyBox acc1 = new MoneyBox("An", 900);
        MoneyBox acc2 = new MoneyBox("Binh", 450);
        acc1.payIn(250);
        acc1.sendMoney(acc2, 300);
        acc2.grow(5, 2);
        acc1.dump();
        acc2.dump();
    }
}
